#!/usr/bin/env bash
# 生产栈发布(人工在服务器上执行)
#
# 与测试栈自动部署(deploy-staging.sh)的分工:
#   - 测试栈:CI 自动调 deploy-staging.sh(见 docs/ops/staging-deploy.md)
#   - 生产栈:**发布仍是人工动作**(理由见 docs/ops/production-deploy.md §7.2),
#     本脚本只是把「校验 → 重建 → 迁移 → 台账断言 → 健康检查 → 失败回滚」固化下来,
#     避免人工发布的步骤随人漂移;它不接入 CI、不自动触发。
#
# 契约(全部由调用方注入,脚本内不写死任何本机路径):
#   TARGET_COMMIT —— 目标发布提交(必填,40 位 sha)
#   DEPLOY_ROOT   —— 生产检出根(必填;其下含 .env.prod 与 workspace/)
#   WEB_IMAGE     —— 目标镜像 tag(可选;默认 acore-portal-prod-web:<sha7>)
#   HEALTH_URL    —— 健康检查地址(可选)
#   COMPOSE_FILE  —— compose 文件路径(可选,相对 DEPLOY_ROOT)
#
# 硬约束(改动本脚本前先读 docs/ops/production-deploy.md §7):
#   - **不碰 git**:不 fetch / 不 checkout / 不 pull / 不 reset。工作树若不在目标提交上,
#     直接拒绝发布并提示人工先拉取——发布脚本不得改动仓库状态(改写 HEAD 会连带改掉
#     「回滚 = 回到上一个提交重新构建」这条人工回滚路径的前提)。
#   - 只重建 web;mysql/redis 的数据卷原地复用,禁止 down -v / 删卷。
#   - 迁移 forward-only:不回滚数据库,回滚只回镜像。
#   - 迁移后断言台账:已完成迁移数须等于仓库里的迁移目录数,且无未完成(失败)行。
set -euo pipefail

TARGET_COMMIT="${TARGET_COMMIT:?必须指定 TARGET_COMMIT(目标发布提交)}"
DEPLOY_ROOT="${DEPLOY_ROOT:?必须指定 DEPLOY_ROOT}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.prod.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/status}"
WEB_IMAGE="${WEB_IMAGE:-acore-portal-prod-web:${TARGET_COMMIT:0:7}}"

log() { printf '\n=== %s ===\n' "$*"; }
die() { echo "✗ $*" >&2; exit 1; }

# ── 预检 ───────────────────────────────────────────────────────────────
log "预检"
case "$DEPLOY_ROOT" in
  /*) ;;
  *) die "DEPLOY_ROOT 必须是绝对路径: $DEPLOY_ROOT" ;;
esac
[ -d "$DEPLOY_ROOT" ] || die "部署根不存在: $DEPLOY_ROOT"
ENV_FILE="$DEPLOY_ROOT/.env.prod"
[ -f "$ENV_FILE" ] || die "env 文件不存在: $ENV_FILE"
MYSQL_DATA_DIR="$DEPLOY_ROOT/workspace/mysql-prod"
[ -d "$MYSQL_DATA_DIR" ] || die "持久卷目录不存在: $MYSQL_DATA_DIR"
[ -n "$(ls -A "$MYSQL_DATA_DIR" 2>/dev/null)" ] || {
  die "持久卷目录为空: $MYSQL_DATA_DIR(拒绝发布,防误指空目录起新空库)"
}
docker compose version >/dev/null
command -v git >/dev/null || die "缺 git(本脚本只校验提交,不代为拉取)"
echo "$TARGET_COMMIT" | grep -Eq '^[0-9a-f]{40}$' || die "TARGET_COMMIT 须为 40 位 sha: $TARGET_COMMIT"

cd "$DEPLOY_ROOT"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# ── 校验发布提交(只读,脚本不改仓库) ───────────────────────────────────
log "校验发布提交(不改动 git)"
HEAD_SHA="$(git rev-parse HEAD)"
if [ "$HEAD_SHA" != "$TARGET_COMMIT" ]; then
  die "工作树不在目标提交上: HEAD=$HEAD_SHA 期望=$TARGET_COMMIT(请先自行拉取到目标提交;本脚本不做任何 git 变更)"
fi
if [ -n "$(git status --porcelain)" ]; then
  die "工作树有未提交改动,拒绝发布(生产只发布已提交的内容)"
fi
echo "提交: $HEAD_SHA"
echo "目标镜像: ${WEB_IMAGE}"

# ── 回滚锚点 ───────────────────────────────────────────────────────────
PREV_IMAGE="$(docker inspect acore-portal-prod-web-1 --format '{{.Config.Image}}' 2>/dev/null || true)"
PREV_IMAGE="${PREV_IMAGE:-}"
echo "当前镜像: ${PREV_IMAGE:-无(首次发布)}"

switched=0
on_error() {
  code=$?
  if [ "$switched" -eq 1 ] && [ -n "$PREV_IMAGE" ]; then
    echo "::error::发布失败,回滚 web 镜像到 ${PREV_IMAGE}"
    WEB_IMAGE="$PREV_IMAGE" "${COMPOSE[@]}" up -d --wait --no-deps web || \
      echo "::error::回滚也失败,需人工介入(生产栈可能处于不可用状态)"
  fi
  exit "$code"
}
trap on_error ERR

# ── 构建 ───────────────────────────────────────────────────────────────
log "构建镜像 ${WEB_IMAGE}"
# 构建信息随镜像产物固化(见 docker/web/Dockerfile):构建时间显式指定上海时区,
# 不依赖宿主机时区;提交号取目标提交短号,与镜像 tag 同源,便于页脚核对版本。
BUILD_TIME="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"
echo "构建信息: ${BUILD_TIME} / ${HEAD_SHA:0:7}"
"${COMPOSE[@]}" build \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  --build-arg APP_SHA="${HEAD_SHA:0:7}" \
  web

# ── 迁移(一次性服务,schema 先行) ──────────────────────────────────────
log "迁移(一次性服务,schema 先行)"
"${COMPOSE[@]}" --profile migrate run --rm migrate

# ── 迁移台账断言 ───────────────────────────────────────────────────────
# 迁移目录数是「本次发布应当落地的迁移数」的唯一真相源;台账与之不符说明
# 迁移没跑全(漏跑)或库里比仓库还新(检出过旧)——两种都要在发布当场拦下,
# 而不是等新代码读不到新列才在运行期暴露。
log "迁移台账断言"
MIGRATION_DIRS="$(find "$DEPLOY_ROOT/prisma/schema-business/migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
ledger() {
  # 库名/口令取容器内环境变量(mysql 服务的 MYSQL_DATABASE / MYSQL_ROOT_PASSWORD),
  # 脚本内不写死任何凭据
  # shellcheck disable=SC2016 # 单引号是故意的:变量在容器内 shell 里展开
  "${COMPOSE[@]}" exec -T mysql sh -c \
    'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -N -B "$MYSQL_DATABASE" -e "$1"' _ "$1"
}
if ! FINISHED="$(ledger 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;')"; then
  die "台账查询失败(见上方 mysql 报错)"
fi
if ! ROLLED_BACK="$(ledger 'SELECT COUNT(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL;')"; then
  die "台账查询失败(见上方 mysql 报错)"
fi
if ! UNFINISHED="$(ledger 'SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;')"; then
  die "台账查询失败(见上方 mysql 报错)"
fi
echo "台账: 已完成=${FINISHED} 已回滚=${ROLLED_BACK} 未完成=${UNFINISHED} 仓库迁移数=${MIGRATION_DIRS}"
[ "$UNFINISHED" = "0" ] || die "台账有未完成行(迁移失败残留): ${UNFINISHED} 行——后续 migrate deploy 会直接拒绝继续,须先 prisma migrate resolve"
[ "$FINISHED" = "$MIGRATION_DIRS" ] || die "台账与仓库迁移数不符: 已完成=${FINISHED} 仓库=${MIGRATION_DIRS}(漏跑迁移,或检出比线上库旧)"

# ── 滚动 web ───────────────────────────────────────────────────────────
log "滚动 web"
switched=1
"${COMPOSE[@]}" up -d --wait

log "健康检查 ${HEALTH_URL}"
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "✓ 健康检查通过"
    break
  fi
  sleep 2
done
if ! curl -fsS "$HEALTH_URL" >/dev/null; then
  echo "✗ 健康检查失败" >&2
  false # 失败即触发 ERR trap → 回滚镜像(直接 exit 不会触发 trap)
fi

printf '%s\n' "$HEAD_SHA" >"$DEPLOY_ROOT/.deployed-sha"

echo "✓ 发布完成: ${WEB_IMAGE} @ ${HEAD_SHA:0:7}"
