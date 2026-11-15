#!/usr/bin/env bash
# 门户业务库 / WP 存量存档库备份(宿主编排;crontab 入口)
#
# 职责切分(宿主既无 mysql client,也无 node_modules/COS SDK):
#   ① dump + gzip 在 mysql 容器内跑,宿主只做管道与落盘;
#   ② 上传 + 校验 + 清单 + 保留期 + 告警在 web 容器内跑(那边才有 COS SDK 与 Prisma)。
#   两段必须分容器,合并成一个脚本会在宿主上缺依赖。
#
# 用法:
#   scripts/cron/backup-run.sh                              # 业务库(每日)
#   BACKUP_TARGETS="wp-legacy" scripts/cron/backup-run.sh    # 存量库(每周)
#
# 环境变量(均有缺省):
#   BACKUP_MYSQL_CONTAINER  业务 MySQL 容器名
#   BACKUP_WEB_CONTAINER    web 容器名(跑上传/校验)
#   BACKUP_WORK_DIR         宿主临时目录(dump 落盘中转)
#   BACKUP_TARGETS          目标清单,空格分隔(business | wp-legacy)
#   BACKUP_LEGACY_SCHEMA    存量库 schema 名
set -euo pipefail

MYSQL_CONTAINER="${BACKUP_MYSQL_CONTAINER:-acore-portal-prod-mysql-1}"
WEB_CONTAINER="${BACKUP_WEB_CONTAINER:-acore-portal-prod-web-1}"
WORK_DIR="${BACKUP_WORK_DIR:-/tmp/acore-backup}"
TARGETS="${BACKUP_TARGETS:-business}"
LEGACY_SCHEMA="${BACKUP_LEGACY_SCHEMA:-wp_legacy}"

log() {
  printf '[backup-run] %s\n' "$*"
}

# 容器内 mysqldump:凭据只取容器自身环境变量(不落到宿主命令行/日志)
# $1=schema 名;dump 参数固定为「一致性快照 + 例程/触发器/事件 + 不导表空间」
dump_schema() {
  local schema="$1"
  docker exec "$MYSQL_CONTAINER" sh -c '
    MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot \
      --single-transaction --routines --triggers --events --no-tablespaces "$1"
  ' sh "$schema"
}

# 目标 → 源 schema:业务库取容器自己的 MYSQL_DATABASE(不写死库名)
target_schema() {
  case "$1" in
    business)
      docker exec "$MYSQL_CONTAINER" sh -c 'printf "%s" "$MYSQL_DATABASE"'
      ;;
    wp-legacy)
      printf '%s' "$LEGACY_SCHEMA"
      ;;
    *)
      echo "未知目标:$1" >&2
      return 1
      ;;
  esac
}

run_target() {
  local target="$1"
  local schema
  schema="$(target_schema "$target")"
  if [ -z "$schema" ]; then
    echo "目标 $target 解析不到源 schema" >&2
    return 1
  fi

  mkdir -p "$WORK_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local name="backup-${target}-${stamp}"
  local gz="${WORK_DIR}/${name}.sql.gz"
  local remote="/tmp/${name}.sql.gz"

  log "开始备份 $target(schema=$schema) → $gz"
  # pipefail:dump 失败即失败,不留下半截压缩包
  dump_schema "$schema" | gzip -6 > "$gz"
  local bytes
  bytes="$(wc -c < "$gz" | tr -d ' ')"
  log "dump 完成:$bytes 字节"

  docker cp "$gz" "${WEB_CONTAINER}:${remote}"
  docker exec "$WEB_CONTAINER" \
    node_modules/.bin/tsx --conditions=react-server scripts/cron/backup.ts \
    --target "$target" --file "$remote"

  rm -f "$gz"
  docker exec "$WEB_CONTAINER" rm -f "$remote"
  log "$target 备份完成"
}

main() {
  for target in $TARGETS; do
    run_target "$target"
  done
}

main "$@"
