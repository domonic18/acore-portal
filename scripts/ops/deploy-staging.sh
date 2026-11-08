#!/usr/bin/env bash
# 测试栈自动部署(Mac Mini 常驻栈)
#
# 由自托管 runner 在 .github/workflows/ci.yml 的 deploy-staging job 里调用:
#   push → develop 且质量门禁 + 迁移守卫全绿 → 本脚本重建 web 镜像并滚动。
#
# 契约(全部由调用方注入,脚本内不写死任何本机路径):
#   DEPLOY_ROOT   —— 部署根目录(必填;其下含 .env.test 与 workspace/ 持久卷根)
#   WEB_IMAGE     —— 目标镜像 tag(必填;部署失败时回滚到上一版)
#   HEALTH_URL    —— 健康检查地址(可选)
#   COMPOSE_FILE  —— compose 文件路径(可选)
#
# 数据安全红线(硬约束,改动本脚本前先读 docs/ops/staging-deploy.md):
#   - 不执行 down -v / 不删卷 / 不删 $DEPLOY_ROOT
#   - 只滚动 web 容器;mysql/redis 的数据卷原地复用
#   - 迁移只向前,不回滚数据库(回滚=回滚代码镜像)
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.test.yml}"
PROJECT_NAME="acore-portal-test"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:9000/api/status}"

DEPLOY_ROOT="${DEPLOY_ROOT:?必须指定 DEPLOY_ROOT}"
WEB_IMAGE="${WEB_IMAGE:?必须指定 WEB_IMAGE}"
# compose 靠这两个变量做插值(卷路径/镜像 tag),必须导出给子进程
export DEPLOY_ROOT WEB_IMAGE

ENV_FILE="$DEPLOY_ROOT/.env.test"
WORKSPACE_ROOT="$DEPLOY_ROOT/workspace"

log() { printf '\n=== %s ===\n' "$*"; }

log "预检"
case "$DEPLOY_ROOT" in
  /*) ;;
  *) echo "✗ DEPLOY_ROOT 必须是绝对路径: $DEPLOY_ROOT" >&2; exit 1 ;;
esac
[ -f "$ENV_FILE" ] || { echo "✗ env 文件不存在: $ENV_FILE" >&2; exit 1; }
[ -d "$WORKSPACE_ROOT/mysql-test" ] || {
  echo "✗ 持久卷目录不存在: $WORKSPACE_ROOT/mysql-test" >&2
  exit 1
}
[ -n "$(ls -A "$WORKSPACE_ROOT/mysql-test" 2>/dev/null)" ] || {
  echo "✗ 持久卷目录为空: $WORKSPACE_ROOT/mysql-test(拒绝部署,防误指空目录起新空库)" >&2
  exit 1
}
docker compose version >/dev/null

cd "$(dirname "$COMPOSE_FILE")/.."
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

PREV_IMAGE="$(docker inspect "${PROJECT_NAME}-web-1" --format '{{.Config.Image}}' 2>/dev/null || true)"
PREV_IMAGE="${PREV_IMAGE:-}"
echo "当前镜像: ${PREV_IMAGE:-无(首次部署)}"
echo "目标镜像: ${WEB_IMAGE}"

switched=0
on_error() {
  code=$?
  if [ "$switched" -eq 1 ] && [ -n "$PREV_IMAGE" ]; then
    echo "::error::部署失败,回滚 web 镜像到 ${PREV_IMAGE}"
    WEB_IMAGE="$PREV_IMAGE" "${COMPOSE[@]}" up -d --wait --no-deps web || \
      echo "::error::回滚也失败,需人工介入(测试栈可能处于不可用状态)"
  fi
  exit "$code"
}
trap on_error ERR

log "构建镜像 ${WEB_IMAGE}"
# 构建信息随镜像产物固化(见 docker/web/Dockerfile):构建时间显式指定上海时区,
# 不依赖 runner 本机时区;提交号与镜像 tag 同源,便于页脚核对版本。
BUILD_TIME="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"
APP_SHA="${GITHUB_SHA:-unknown}"
APP_SHA="${APP_SHA:0:7}"
echo "构建信息: ${BUILD_TIME} / ${APP_SHA}"
"${COMPOSE[@]}" build \
  --build-arg BUILD_TIME="$BUILD_TIME" \
  --build-arg APP_SHA="$APP_SHA" \
  web

log "迁移(一次性服务,schema 先行)"
"${COMPOSE[@]}" --profile migrate run --rm migrate

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
curl -fsS "$HEALTH_URL" >/dev/null || {
  echo "✗ 健康检查失败" >&2
  false # 失败即触发 ERR trap → 回滚镜像(直接 exit 不会触发 trap)
}

mkdir -p "$DEPLOY_ROOT"
printf '%s\n' "${GITHUB_SHA:-unknown}" >"$DEPLOY_ROOT/current-sha"

echo "✓ 部署完成: ${WEB_IMAGE}"
