#!/usr/bin/env bash
# 统一部署脚本(staging 与 prod 共用一份语义)
#
# 由 CI 调用(见 .github/workflows/ci.yml 的 deploy-staging / deploy-production):
#   push → develop  → staging:bash scripts/deploy.sh --env staging --tag develop-<sha7>
#   push → main     → prod   :bash scripts/deploy.sh --env prod    --tag main-<sha7>
#
# 语义:预检 → 钉镜像 → 拉镜像 → 迁移先行 → 换容器 → 健康检查 → 落状态
#       → 失败自动回滚 → 镜像清理(只留最近若干个)。
#
# 契约(全部由调用方注入,脚本内不写死任何本机路径与凭据):
#   DEPLOY_ROOT     —— 部署根目录(必填;其下含 env 文件与 workspace/ 持久卷根)
#   DEPLOY_NAMESPACE—— TCR 命名空间(必填;镜像全路径 = registry/namespace/acore-portal)
#   DEPLOY_KEEP_IMAGES —— 保留镜像个数(默认 3)
#
# 数据安全红线(改动本脚本前先读 docs/ops/production-deploy.md):
#   - 不执行 down -v / 不删卷 / 不删 $DEPLOY_ROOT
#   - 只滚动 web 容器;mysql/redis 的数据卷原地复用
#   - 迁移只向前,不回滚数据库(回滚=回滚代码镜像)
set -euo pipefail

ENV_NAME=""
IMAGE_TAG=""
KEEP_IMAGES="${DEPLOY_KEEP_IMAGES:-3}"
REGISTRY="ccr.ccs.tencentyun.com"
IMAGE_NAME="acore-portal"

DEPLOY_ROOT="${DEPLOY_ROOT:?必须指定 DEPLOY_ROOT}"
DEPLOY_NAMESPACE="${DEPLOY_NAMESPACE:?必须指定 DEPLOY_NAMESPACE(TCR 命名空间)}"

log()  { printf '\n=== %s ===\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

usage() {
  cat >&2 <<'EOF'
用法: bash scripts/deploy.sh --env <staging|prod> --tag <image-tag>
  --env   staging(测试栈) | prod(生产栈)
  --tag   镜像 tag,须形如 develop-xxxxxxx / main-xxxxxxx
EOF
  exit 1
}

# ---- 环境差异表:两环境只在路径/端口/项目名上不同,其余语义共用 ----
# 参数逐个解析(不能用一次性 case:case 只判断一次,--env 后 shift 掉就不再认 --tag)
while [ $# -gt 0 ]; do
  case "$1" in
  --env) ENV_NAME="${2:-}"; shift 2 ;;
  --tag) IMAGE_TAG="${2:-}"; shift 2 ;;
  *)     usage ;;
  esac
done
[ -n "$ENV_NAME" ] && [ -n "$IMAGE_TAG" ] || usage

case "$ENV_NAME" in
staging)
  ENV_FILE="$DEPLOY_ROOT/.env.test"
  COMPOSE_FILE="docker/docker-compose.test.yml"
  PROJECT_NAME="acore-portal-test"
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9000/api/status}"
  ;;
prod)
  ENV_FILE="$DEPLOY_ROOT/.env.prod"
  COMPOSE_FILE="docker/docker-compose.prod.yml"
  PROJECT_NAME="acore-portal-prod"
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/status}"
  ;;
*) usage ;;
esac

export DEPLOY_ROOT
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# ---------------------------------------------------------------- 预检

log "预检"
case "$DEPLOY_ROOT" in
  /*) ;;
  *) die "DEPLOY_ROOT 必须是绝对路径: $DEPLOY_ROOT" ;;
esac
[ -d "$DEPLOY_ROOT" ] || die "部署根不存在: $DEPLOY_ROOT"
[ -f "$ENV_FILE" ] || die "env 文件不存在: $ENV_FILE"
[ -f "$DEPLOY_ROOT/$COMPOSE_FILE" ] || die "compose 文件不存在: $DEPLOY_ROOT/$COMPOSE_FILE"
docker compose version >/dev/null 2>&1 || die "缺 compose v2 CLI 插件(docker compose 不可用)"
# tag 形态校验:短 tag 不可变是回滚能精确到版本的前提
echo "$IMAGE_TAG" | grep -Eq '^(main|develop)-[0-9a-f]{7,40}$' \
  || die "非法镜像 tag: $IMAGE_TAG(须形如 main-xxxxxxx / develop-xxxxxxx)"
# tag 前缀与环境强绑定:生产只收 main-*(linux/amd64),测试只收 develop-*(linux/arm64)。
# 这同时挡住「拿错分支的镜像」与「架构不匹配的镜像」两类事故。
case "$ENV_NAME" in
staging) echo "$IMAGE_TAG" | grep -q '^develop-' || die "测试环境只接受 develop-* tag(收到 $IMAGE_TAG)";;
prod)    echo "$IMAGE_TAG" | grep -q '^main-'    || die "生产环境只接受 main-* tag(收到 $IMAGE_TAG)";;
esac

IMAGE_REF="$REGISTRY/$DEPLOY_NAMESPACE/$IMAGE_NAME:$IMAGE_TAG"

# 架构归一:docker image inspect 报 arm64/amd64,docker info 报 aarch64/x86_64,
# 同一架构两种叫法,直接比会误判成"架构不符"
normalize_arch() {
  case "$1" in
    aarch64|arm64) echo "arm64" ;;
    x86_64|amd64)  echo "amd64" ;;
    *)             echo "$1" ;;
  esac
}

# 宿主架构:发布前校验镜像架构与之相符(生产是 x86_64 Linux,须 amd64 镜像)
HOST_ARCH="$(normalize_arch "$(docker info --format '{{.Architecture}}' 2>/dev/null || echo unknown)")"

# ---------------------------------------------------------------- 状态与回滚

STATE_FILE="$DEPLOY_ROOT/.deploy-state"

read_state_field() { # 字段名
  [ -f "$STATE_FILE" ] || return 0
  sed -n "s/^$1=//p" "$STATE_FILE" | tail -n 1
}

write_state() { # 状态 tag previous_tag commit previous_ref
  printf 'status=%s\ntag=%s\nprevious_tag=%s\ncommit=%s\nprevious_ref=%s\nupdated_at=%s\n' \
    "$1" "$2" "${3:-}" "${4:-}" "${5:-}" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$STATE_FILE"
}

env_get() { # 键
  sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | tail -n 1
}

set_env_var() { # 键 值
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if [ -f "$ENV_FILE" ]; then
    grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  fi
  printf '%s=%s\n' "$key" "$val" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# ---------------------------------------------------------------- 镜像

image_ref() { printf '%s/%s/%s:%s' "$REGISTRY" "$DEPLOY_NAMESPACE" "$IMAGE_NAME" "$IMAGE_TAG"; }

pull_image() {
  # 短 tag 不可变:拉取失败但本地已有同 tag 镜像时继续走(回滚场景下仓库可能不可达)
  if docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
    log "本地已有镜像 $IMAGE_REF,跳过拉取"
  else
    log "拉取镜像 $IMAGE_REF"
    docker pull "$IMAGE_REF" || return 1
  fi
  # 架构闸(拉取成功后才判):镜像架构必须与宿主一致(生产是 x86_64 Linux → 必须是 amd64 镜像)。
  # 架构不符时容器会以 exec format error 起不来,与其等健康检查失败才发现,不如在此拦停。
  local img_arch
  img_arch="$(normalize_arch "$(docker image inspect --format '{{.Architecture}}' "$IMAGE_REF" 2>/dev/null || echo unknown)")"
  if [ "$HOST_ARCH" != "unknown" ] && [ "$img_arch" != "$HOST_ARCH" ]; then
    die "镜像架构与宿主不符:镜像=$img_arch 宿主=$HOST_ARCH($IMAGE_REF)。生产为 x86_64,须用 amd64 镜像"
  fi
  log "镜像架构校验通过:$img_arch(宿主 $HOST_ARCH)"
}

cleanup_images() { # 当前 tag 回滚目标 tag
  local current_tag="$1" protect_tag="$2" repo tags i t
  # 覆盖两类镜像来源:
  #   ① TCR 镜像(registry/namespace/acore-portal)——CI 推的正式来源;
  #   ② 历史本地构建遗留(acore-portal-test / acore-portal-prod-web)——改造前的部署方式,
  #      每个提交留一个近 1GB 的镜像,不清就把磁盘吃满(2026-11-14 实测本地积压 8 个)。
  # 过滤参数必须是完整仓库名:只给命名空间匹配不到(docker images 按完整名匹配),
  # 过滤落空会让清理静默空转。
  for repo in "$REGISTRY/$DEPLOY_NAMESPACE/$IMAGE_NAME" acore-portal-test acore-portal-prod-web; do
    tags="$(docker images --format '{{.Tag}}\t{{.CreatedAt}}' "$repo" 2>/dev/null \
      | awk -F'\t' '$1 ~ /^(main|develop)-[0-9a-f]{7,40}$/ || $1 == "latest"' \
      | sort -k2 -r | cut -f1)"
    [ -n "$tags" ] || continue
    i=0
    for t in $tags; do
      i=$((i + 1))
      # 当前版本与上一个版本(回滚目标)永不删除
      if [ "$i" -gt "$KEEP_IMAGES" ] && [ "$t" != "$current_tag" ] && [ "$t" != "$protect_tag" ]; then
        docker image rm "$repo:$t" >/dev/null 2>&1 \
          || warn "镜像删除失败(可能被容器引用):$repo:$t"
      fi
    done
  done
  # 只清悬空层:docker image prune -a 会连回滚目标一起删掉
  docker image prune -f >/dev/null 2>&1 || true
  log "镜像清理完成(每仓库保留最新 $KEEP_IMAGES 个,当前与回滚目标不删)"
}

# ---------------------------------------------------------------- 部署动作

wait_healthy() { # 超时秒
  local timeout="$1" waited=0
  while [ "$waited" -lt "$timeout" ]; do
    if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

rollback_to() { # 上一版完整镜像引用
  local prev_ref="$1" prev_tag="$2"
  [ -n "$prev_ref" ] || { warn "无可回滚版本,保持现场等待人工处理"; return 1; }
  warn "回滚到 $prev_ref"
  if ! docker image inspect "$prev_ref" >/dev/null 2>&1; then
    docker pull "$prev_ref" || { warn "回滚镜像拉取失败"; return 1; }
  fi
  WEB_IMAGE="$prev_ref" "${COMPOSE[@]}" up -d --wait --no-deps --no-build web \
    || { warn "回滚失败,需人工介入"; return 1; }
  wait_healthy 120 || { warn "回滚后健康检查未通过,需人工介入"; return 1; }
  warn "回滚成功:当前运行 $prev_ref"
  return 0
}

# ---------------------------------------------------------------- 主流程

log "部署 $ENV_NAME,目标镜像 $IMAGE_TAG"
cd "$DEPLOY_ROOT"

# 上一个版本 = **当前运行容器的镜像**(权威,保留完整引用);env 文件与状态文件只作次选。
# 取 env 不可靠:上一次失败的运行可能已把新 tag 写进 env,而容器还跑着旧镜像。
# 完整引用要留着:当前运行的镜像未必来自 TCR(如历史本地构建的镜像名),
# 回滚时得能直接引用它,不能一律按 TCR 路径拼。
previous_ref="$(docker inspect "${PROJECT_NAME}-web-1" --format '{{.Config.Image}}' 2>/dev/null || true)"
[ -n "$previous_ref" ] || previous_ref="$(env_get WEB_IMAGE '')"
[ -n "$previous_ref" ] || previous_ref="$(read_state_field previous_ref '')"
previous_tag="${previous_ref##*:}"
previous="$previous_tag"
commit="$IMAGE_TAG"

# 先拉镜像,**拉成功后才钉 env**:拉失败时 env 保持原样,不会指向一个从未跑起来的 tag
if ! pull_image; then
  die "镜像拉取失败:$IMAGE_TAG(env 未改动,当前版本继续服务)"
fi

# 钉镜像(写 env 文件,compose 靠它插值;回滚目标也落在这里)
set_env_var WEB_IMAGE "$IMAGE_REF"
log "镜像钉为 $IMAGE_TAG(上一个版本: ${previous:-无})"

# 迁移先行:schema 没到位就换容器,新代码读不到新列
log "迁移先行"
if ! "${COMPOSE[@]}" --profile migrate run --rm migrate; then
  if [ -n "$previous" ]; then set_env_var WEB_IMAGE "$REGISTRY/$DEPLOY_NAMESPACE/$IMAGE_NAME:$previous"; fi
  die "数据库迁移失败:已中止发布,旧版本继续服务(未换容器)"
fi

# 只换 web:mysql/redis 的数据卷原地复用,绝不 down -v
if ! WEB_IMAGE="$IMAGE_REF" "${COMPOSE[@]}" up -d --wait --no-deps --no-build web; then
  warn "容器更新失败"
  write_state FAILED "$IMAGE_TAG" "$previous" "$commit" "$previous_ref"
  rollback_to "$previous_ref" "$previous" || true
  die "部署失败,已尝试回滚"
fi

if ! wait_healthy 180; then
  warn "健康检查未通过"
  write_state FAILED "$IMAGE_TAG" "$previous" "$commit" "$previous_ref"
  rollback_to "$previous_ref" "$previous" || true
  die "部署失败(健康检查未通过),已尝试回滚"
fi

write_state OK "$IMAGE_TAG" "$previous" "$commit" "$previous_ref"
log "部署成功:$IMAGE_TAG"

cleanup_images "$IMAGE_TAG" "$previous"
log "完成"
