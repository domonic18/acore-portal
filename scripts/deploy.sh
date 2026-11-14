#!/usr/bin/env bash
# 统一部署脚本:测试栈 / 生产栈 / CI 发布 / 人工兜底,**一份实现**。
#
# 取镜像的两种方式:
#   ① CI 模式(默认)——从 TCR 拉指定 tag 的镜像:
#        bash scripts/deploy.sh --env staging --tag develop-<sha7>
#        bash scripts/deploy.sh --env prod    --tag main-<sha7>
#   ② 本地构建模式(CI 不可用时的人工兜底)——从发布资产根的当前提交现场构建:
#        bash scripts/deploy.sh --env prod --build-local
#
# 语义(两模式完全一致):
#   预检 → 取镜像 → 钉镜像 → 迁移先行 → 迁移台账断言
#   → 只换 web → 健康检查 → 落状态 → 镜像清理;换容器后任一步失败自动回滚镜像。
#
# 两条根目录(**别混**):
#   发布资产根(默认 = 脚本所在仓库根;可用 DEPLOY_ASSET_ROOT 覆盖)
#     —— compose 文件、迁移集(prisma/schema-business)、构建上下文。
#        **必须与本次发布的镜像同源(同一 commit)**:迁移集与代码不同源 = 新代码读不到新列。
#   DEPLOY_ROOT —— env 文件与 workspace/ 持久卷根(数据与凭据在 git 检出之外)。
#     CI 侧两者不同源是正常的:资产来自流水线检出,数据来自常驻部署根。
#
# 契约(全部由调用方注入,脚本内不写死任何本机路径与凭据):
#   DEPLOY_ROOT        —— 部署根(必填;其下含 env 文件与 workspace/ 持久卷根)
#   DEPLOY_ASSET_ROOT  —— 发布资产根(可选;默认脚本所在仓库根)
#   DEPLOY_NAMESPACE   —— TCR 命名空间(CI 模式必填;镜像全路径 = registry/namespace/acore-portal)
#   DEPLOY_KEEP_IMAGES —— 保留镜像个数(默认 3)
#   TARGET_COMMIT      —— 本地构建模式的目标提交(可选;给了则必须等于资产根 HEAD)
#
# 数据安全红线(改动本脚本前先读 docs/ops/production-deploy.md):
#   - 不执行 down -v / 不删卷 / 不删 $DEPLOY_ROOT
#   - 只滚动 web 容器;mysql/redis 的数据卷原地复用
#   - 迁移只向前,不回滚数据库(回滚=回滚代码镜像)
set -euo pipefail

ENV_NAME=""
IMAGE_TAG=""
BUILD_LOCAL=0
KEEP_IMAGES="${DEPLOY_KEEP_IMAGES:-3}"
REGISTRY="ccr.ccs.tencentyun.com"
IMAGE_NAME="acore-portal"

DEPLOY_ROOT="${DEPLOY_ROOT:?必须指定 DEPLOY_ROOT(部署根:其下含 env 文件与 workspace/ 持久卷根)}"

# 发布资产根 = 脚本所在仓库根(compose / 迁移集 / 构建上下文都在它下面)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_ROOT="${DEPLOY_ASSET_ROOT:-$(dirname "$SCRIPT_DIR")}"

log()  { printf '\n=== %s ===\n' "$*"; }
warn() { printf '! %s\n' "$*" >&2; }
die()  { printf '✗ %s\n' "$*" >&2; exit 1; }

usage() {
  cat >&2 <<'EOF'
用法: bash scripts/deploy.sh --env <staging|prod> (--tag <image-tag> | --build-local)
  --env         staging(测试栈) | prod(生产栈)
  --tag         镜像 tag,须形如 develop-xxxxxxx / main-xxxxxxx(CI 模式)
  --build-local 从发布资产根的当前提交现场构建镜像(CI 不可用时的人工兜底)
EOF
  exit 1
}

# 参数逐个解析(不能用一次性 case:case 只判断一次,--env 后 shift 掉就不再认 --tag)
while [ $# -gt 0 ]; do
  case "$1" in
  --env) ENV_NAME="${2:-}"; shift 2 ;;
  --tag) IMAGE_TAG="${2:-}"; shift 2 ;;
  --build-local) BUILD_LOCAL=1; shift ;;
  *) usage ;;
  esac
done
[ -n "$ENV_NAME" ] || usage
[ "$BUILD_LOCAL" = "1" ] || [ -n "$IMAGE_TAG" ] || usage

# ---- 环境差异表:两环境只在路径/端口/项目名上不同,其余语义共用 ----
case "$ENV_NAME" in
staging)
  ENV_FILE="$DEPLOY_ROOT/.env.test"
  COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-$ASSET_ROOT/docker/docker-compose.test.yml}"
  PROJECT_NAME="acore-portal-test"
  LOCAL_IMAGE_REPO="acore-portal-test-web"
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9000/api/status}"
  ;;
prod)
  ENV_FILE="$DEPLOY_ROOT/.env.prod"
  COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-$ASSET_ROOT/docker/docker-compose.prod.yml}"
  PROJECT_NAME="acore-portal-prod"
  LOCAL_IMAGE_REPO="acore-portal-prod-web"
  HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/status}"
  ;;
*) usage ;;
esac

# 迁移集:迁移服务(migrate 一次性容器)实际应用的就是它——
# compose 里挂的是 `<compose 所在目录>/../prisma/schema-business`,与发布资产根同源。
MIGRATIONS_DIR="${DEPLOY_MIGRATIONS_DIR:-$ASSET_ROOT/prisma/schema-business/migrations}"

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
[ -f "$COMPOSE_FILE" ] || die "compose 文件不存在: $COMPOSE_FILE"
[ -d "$MIGRATIONS_DIR" ] || die "迁移集不存在: $MIGRATIONS_DIR(发布资产根须含 prisma/schema-business/migrations)"
docker compose version >/dev/null 2>&1 || die "缺 compose v2 CLI 插件(docker compose 不可用)"

if [ "$BUILD_LOCAL" = "1" ]; then
  # 本地构建模式:发布资产根必须是干净的 git 检出,且(给了 TARGET_COMMIT 时)HEAD 就是目标提交。
  # **脚本不碰 git**:不 fetch / 不 checkout / 不 pull / 不 reset——发布脚本改仓库状态会
  # 连带破坏「回滚 = 回到上一个提交重新构建」这条人工回滚路径的前提。
  command -v git >/dev/null || die "缺 git(本模式只校验提交,不代为拉取)"
  git -C "$ASSET_ROOT" rev-parse --git-dir >/dev/null 2>&1 || die "发布资产根不是 git 仓库: $ASSET_ROOT"
  HEAD_SHA="$(git -C "$ASSET_ROOT" rev-parse HEAD)"
  if [ -n "$(git -C "$ASSET_ROOT" status --porcelain)" ]; then
    die "发布资产根有未提交改动,拒绝发布(只发布已提交的内容)"
  fi
  if [ -n "${TARGET_COMMIT:-}" ] && [ "$HEAD_SHA" != "$TARGET_COMMIT" ]; then
    die "发布资产根不在目标提交上: HEAD=$HEAD_SHA 期望=$TARGET_COMMIT(请先自行拉取到目标提交;本脚本不做任何 git 变更)"
  fi
  SHA_SHORT="${HEAD_SHA:0:7}"
  IMAGE_REF="$LOCAL_IMAGE_REPO:$SHA_SHORT"
  # 状态文件里的 tag:CI 模式记镜像 tag(main-xxxxxxx),本地构建模式记裸短号
  STATE_TAG="$SHA_SHORT"
else
  # tag 形态校验:短 tag 不可变是回滚能精确到版本的前提
  echo "$IMAGE_TAG" | grep -Eq '^(main|develop)-[0-9a-f]{7,40}$' \
    || die "非法镜像 tag: $IMAGE_TAG(须形如 main-xxxxxxx / develop-xxxxxxx)"
  # tag 前缀与环境强绑定:生产只收 main-*(linux/amd64),测试只收 develop-*(linux/arm64)。
  # 这同时挡住「拿错分支的镜像」与「架构不匹配的镜像」两类事故。
  case "$ENV_NAME" in
  staging) echo "$IMAGE_TAG" | grep -q '^develop-' || die "测试环境只接受 develop-* tag(收到 $IMAGE_TAG)";;
  prod)    echo "$IMAGE_TAG" | grep -q '^main-'    || die "生产环境只接受 main-* tag(收到 $IMAGE_TAG)";;
  esac
  DEPLOY_NAMESPACE="${DEPLOY_NAMESPACE:?必须指定 DEPLOY_NAMESPACE(TCR 命名空间)}"
  IMAGE_REF="$REGISTRY/$DEPLOY_NAMESPACE/$IMAGE_NAME:$IMAGE_TAG"
  SHA_SHORT="${IMAGE_TAG##*-}"
  STATE_TAG="$IMAGE_TAG"
fi

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

pull_image() {
  # 短 tag 不可变:拉取失败但本地已有同 tag 镜像时继续走(回滚场景下仓库可能不可达)
  if docker image inspect "$IMAGE_REF" >/dev/null 2>&1; then
    log "本地已有镜像 $IMAGE_REF,跳过拉取"
  else
    log "拉取镜像 $IMAGE_REF"
    docker pull "$IMAGE_REF" || return 1
  fi
}

build_image_local() {
  # 构建信息随镜像产物固化(见 docker/web/Dockerfile):构建时间显式指定上海时区,
  # 不依赖宿主机时区;提交号与镜像 tag 同源,便于页脚核对版本。
  local build_time
  build_time="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"
  log "构建镜像 $IMAGE_REF(构建信息 $build_time / $SHA_SHORT)"
  WEB_IMAGE="$IMAGE_REF" "${COMPOSE[@]}" build \
    --build-arg BUILD_TIME="$build_time" \
    --build-arg APP_SHA="$SHA_SHORT" \
    web
}

check_image_arch() {
  # 架构闸(取到镜像后才判):镜像架构必须与宿主一致(生产是 x86_64 Linux → 必须是 amd64 镜像)。
  # 架构不符时容器会以 exec format error 起不来,与其等健康检查失败才发现,不如在此拦停。
  local img_arch
  img_arch="$(normalize_arch "$(docker image inspect --format '{{.Architecture}}' "$IMAGE_REF" 2>/dev/null || echo unknown)")"
  if [ "$HOST_ARCH" != "unknown" ] && [ "$img_arch" != "$HOST_ARCH" ]; then
    die "镜像架构与宿主不符:镜像=$img_arch 宿主=$HOST_ARCH($IMAGE_REF)。生产为 x86_64,须用 amd64 镜像"
  fi
  log "镜像架构校验通过:$img_arch(宿主 $HOST_ARCH)"
}

cleanup_images() { # 保留的完整镜像引用(空格分隔:当前版本 + 回滚目标)
  local keep_refs="$1" repo tags i t ref
  # 覆盖两类镜像来源:
  #   ① TCR 镜像(registry/namespace/acore-portal)——CI 推的正式来源;
  #   ② 历史本地构建遗留(acore-portal-test / acore-portal-prod-web)——改造前的部署方式,
  #      每个提交留一个近 1GB 的镜像,不清就把磁盘吃满(2026-11-14 实测本地积压 8 个)。
  # 过滤参数必须是完整仓库名:只给命名空间匹配不到(docker images 按完整名匹配),
  # 过滤落空会让清理静默空转。
  for repo in ${DEPLOY_NAMESPACE:+"$REGISTRY/$DEPLOY_NAMESPACE/$IMAGE_NAME"} acore-portal-test acore-portal-prod-web; do
    # tag 形态:CI 推的 main-/develop- 前缀,本地构建遗留的裸短号,以及 latest 浮动 tag
    tags="$(docker images --format '{{.Tag}}\t{{.CreatedAt}}' "$repo" 2>/dev/null \
      | awk -F'\t' '$1 ~ /^(main|develop)-[0-9a-f]{7,40}$/ || $1 ~ /^[0-9a-f]{7,40}$/ || $1 == "latest"' \
      | sort -k2 -r | cut -f1)"
    [ -n "$tags" ] || continue
    i=0
    for t in $tags; do
      i=$((i + 1))
      ref="$repo:$t"
      # 当前版本与上一个版本(回滚目标)永不删除——按**完整引用**比对,
      # 因为同一个镜像在不同仓库里的 tag 形态不同(TCR 是 main-xxx,本地构建是裸短号)
      case " $keep_refs " in *" $ref "*) continue ;; esac
      if [ "$i" -gt "$KEEP_IMAGES" ]; then
        docker image rm "$ref" >/dev/null 2>&1 \
          || warn "镜像删除失败(可能被容器引用):$ref"
      fi
    done
  done
  # 只清悬空层:docker image prune -a 会连回滚目标一起删掉
  docker image prune -f >/dev/null 2>&1 || true
  log "镜像清理完成(每仓库保留最新 $KEEP_IMAGES 个,当前与回滚目标不删)"
}

# ---------------------------------------------------------------- 迁移台账

# 三个迁移集视图:
#   applied —— 迁移服务将应用的集合(发布资产根的 prisma/schema-business/migrations)
#   image   —— 发布镜像内含的集合(镜像带 prisma/,见 docker/web/Dockerfile)
#   ledger  —— 库内 _prisma_migrations 已完成且未回滚的集合
# 三者的关系就是「该落库的落了没」与「代码要的迁移带了没」。
migration_names_applied() {
  find "$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | LC_ALL=C sort
}

migration_names_image() {
  docker run --rm --entrypoint sh "$IMAGE_REF" -c \
    'ls -1 /app/prisma/schema-business/migrations 2>/dev/null | grep -v "^migration_lock.toml$"' \
    | LC_ALL=C sort
}

ledger_query() { # SQL
  # 库名/口令取容器内环境变量(mysql 服务的 MYSQL_DATABASE / MYSQL_ROOT_PASSWORD),
  # 脚本内不写死任何凭据
  # shellcheck disable=SC2016 # 单引号是故意的:变量在容器内 shell 里展开
  "${COMPOSE[@]}" exec -T mysql sh -c \
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "$1"' _ "$1"
}

migration_names_ledger() {
  ledger_query "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;" \
    | LC_ALL=C sort
}

assert_migration_ledger() {
  log "迁移台账断言"
  local applied image ledger unfinished missing
  applied="$(migration_names_applied)"
  image="$(migration_names_image)"
  ledger="$(migration_names_ledger)"
  unfinished="$(ledger_query 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;')"

  [ -n "$applied" ] || die "迁移集为空: $MIGRATIONS_DIR"
  echo "迁移集: 应用集=$(echo "$applied" | wc -l | tr -d ' ') 镜像集=$(echo "$image" | wc -l | tr -d ' ') 台账=$(echo "$ledger" | wc -l | tr -d ' ') 未完成行=$unfinished"

  # ① 迁移失败残留:此后 migrate deploy 会直接拒绝继续,须先 prisma migrate resolve
  [ "$unfinished" = "0" ] || die "台账有未完成行(迁移失败残留): $unfinished 行——须先 prisma migrate resolve"

  # ② 应用集须全部落库(漏跑迁移当场暴露,而不是等新代码读不到新列才在运行期炸)
  missing="$(comm -23 <(printf '%s\n' "$applied") <(printf '%s\n' "$ledger"))"
  [ -z "$missing" ] || die "迁移未全部落库:$(echo "$missing" | tr '\n' ' ')(漏跑迁移,或库比发布资产旧)"

  # ③ 镜像要的迁移须都在应用集里(发布资产与镜像不同源 → 新代码读不到新列)
  missing="$(comm -23 <(printf '%s\n' "$image") <(printf '%s\n' "$applied"))"
  [ -z "$missing" ] || die "发布镜像含未随迁移集下发的迁移:$(echo "$missing" | tr '\n' ' ')(发布资产与镜像不同源)"
  log "迁移台账一致"
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
  local prev_ref="$1"
  [ -n "$prev_ref" ] || { warn "无可回滚版本,保持现场等待人工处理"; return 1; }
  warn "回滚到 $prev_ref"
  if ! docker image inspect "$prev_ref" >/dev/null 2>&1; then
    docker pull "$prev_ref" || { warn "回滚镜像拉取失败"; return 1; }
  fi
  # 镜像钉一并退回:env 文件里的 WEB_IMAGE 若还指着失败的那版,下次部署的
  # 回滚锚点会取到一个从未跑起来的镜像
  set_env_var WEB_IMAGE "$prev_ref"
  WEB_IMAGE="$prev_ref" "${COMPOSE[@]}" up -d --wait --no-deps --no-build web \
    || { warn "回滚失败,需人工介入"; return 1; }
  wait_healthy 120 || { warn "回滚后健康检查未通过,需人工介入"; return 1; }
  warn "回滚成功:当前运行 $prev_ref"
  return 0
}

# ---------------------------------------------------------------- 主流程

log "部署 $ENV_NAME,目标镜像 $IMAGE_REF"
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

# 先取镜像,**取成功后才钉 env**:取失败时 env 保持原样,不会指向一个从未跑起来的 tag
if [ "$BUILD_LOCAL" = "1" ]; then
  if ! build_image_local; then
    die "镜像构建失败(env 未改动,当前版本继续服务)"
  fi
else
  if ! pull_image; then
    die "镜像拉取失败:$IMAGE_TAG(env 未改动,当前版本继续服务)"
  fi
fi
check_image_arch

# 钉镜像(写 env 文件,compose 靠它插值;回滚目标也落在这里)
set_env_var WEB_IMAGE "$IMAGE_REF"
log "镜像钉为 $IMAGE_REF(上一个版本: ${previous:-无})"

# 迁移先行:schema 没到位就换容器,新代码读不到新列
log "迁移先行"
if ! "${COMPOSE[@]}" --profile migrate run --rm migrate; then
  if [ -n "$previous_ref" ]; then set_env_var WEB_IMAGE "$previous_ref"; fi
  die "数据库迁移失败:已中止发布,旧版本继续服务(未换容器)"
fi

# 迁移台账断言:漏跑迁移 / 发布资产与镜像不同源,都在换容器前拦下
assert_migration_ledger

# 只换 web:mysql/redis 的数据卷原地复用,绝不 down -v
if ! WEB_IMAGE="$IMAGE_REF" "${COMPOSE[@]}" up -d --wait --no-deps --no-build web; then
  warn "容器更新失败"
  write_state FAILED "$STATE_TAG" "$previous" "$SHA_SHORT" "$previous_ref"
  rollback_to "$previous_ref" || true
  die "部署失败,已尝试回滚"
fi

if ! wait_healthy 180; then
  warn "健康检查未通过"
  write_state FAILED "$STATE_TAG" "$previous" "$SHA_SHORT" "$previous_ref"
  rollback_to "$previous_ref" || true
  die "部署失败(健康检查未通过),已尝试回滚"
fi

write_state OK "$STATE_TAG" "$previous" "$SHA_SHORT" "$previous_ref"
log "部署成功:$IMAGE_REF"

cleanup_images "$IMAGE_REF $previous_ref"
log "完成"
