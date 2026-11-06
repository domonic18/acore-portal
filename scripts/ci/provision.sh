#!/usr/bin/env bash
# CI 环境自举:游戏四库结构与账号 + WP 存量库空壳 + 业务库系统配置基线
#
# 分两段(业务库迁移前后各跑一段):
#   game   —— 建游戏四库结构与账号 + WP 存量库空壳(须在 prisma migrate 之前:migrate dev 需要 shadow DB 权限)
#   config —— 落 system_config 全键基线 + 按 CI 端口改写游戏库连接串
#             (须在 prisma migrate deploy 之后:system_config 表由迁移建出)
#
# 复用 dev 栈同一份 initdb 脚本,CI 不另造 schema/账号口径。
# 用法(GitHub Actions 内):
#   MYSQL_CID=<容器 id> bash scripts/ci/provision.sh game
#   MYSQL_CID=<容器 id> CI_MYSQL_PORT=3306 bash scripts/ci/provision.sh config
# 其中 <容器 id> 取自 GitHub Actions 表达式 job.services.mysql.id;
# 本地演练可直接传容器名(docker exec 两者皆可)。
set -euo pipefail

# 注意:错误提示文案里不能出现双花括号 —— bash 的 ${VAR:?msg} 会在第一个右花括号处
# 提前闭合,导致剩余字符被拼到变量值后面(实测得到 "容器名})}")。
if [ -z "${MYSQL_CID:-}" ]; then
  echo "需指定 MySQL 容器 id 或容器名" >&2
  exit 2
fi
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
CI_MYSQL_PORT="${CI_MYSQL_PORT:-3306}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

mysql_exec() {
  docker exec -i "$MYSQL_CID" mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
    --default-character-set=utf8mb4 "$@"
}

case "${1:-}" in
  game)
    mysql_exec < "$REPO_ROOT/scripts/dev/initdb/init-game-schemas.sql"
    # WP 存量库(仅结构):存量迁移用例读写它,CI 没有生产 dump,须建空壳
    mysql_exec < "$REPO_ROOT/scripts/ci/init-wp-legacy.sql"
    echo "[ci] 游戏四库结构与账号就绪"
    ;;
  config)
    mysql_exec < "$REPO_ROOT/scripts/dev/initdb/init-system-config.sql"
    # 游戏库连接串:init 脚本里写的是宿主机 dev 栈端口(3307),CI 走 service container 端口
    mysql_exec acore_portal -e \
      "UPDATE system_config SET value=REPLACE(value,'localhost:3307','localhost:${CI_MYSQL_PORT}') WHERE \`key\` LIKE 'gamedb.%';"
    echo "[ci] system_config 基线就绪(游戏库端口=${CI_MYSQL_PORT})"
    ;;
  *)
    echo "用法: $0 {game|config}" >&2
    exit 2
    ;;
esac
