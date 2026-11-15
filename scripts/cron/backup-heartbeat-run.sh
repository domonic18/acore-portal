#!/usr/bin/env bash
# 备份心跳检查(宿主编排;crontab 入口)
#
# 心跳独立于备份脚本:备份脚本「成功」不等于「按时跑过」——crontab 没挂、
# 容器起不来、脚本被改坏,都可能让备份静默不跑。心跳读 COS 清单里的最新完成
# 时刻,超阈值(默认 26 小时)判缺失。
#
# 退出码:0 健康;2 心跳缺失(与「有差异」同义,便于 cron 侧区分)。
#
# 环境变量(均有缺省):
#   BACKUP_WEB_CONTAINER  web 容器名
set -euo pipefail

WEB_CONTAINER="${BACKUP_WEB_CONTAINER:-acore-portal-prod-web-1}"

# docker 访问方式:生产机运维账号不在 docker 组,发布链路统一走 `sudo docker`
# (免密);本机测试栈账号直接在 docker 组里。cron 环境无交互式密码输入。
if docker version >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker version >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  echo "无可用的 docker 访问权限(当前用户既不在 docker 组也无免密 sudo)" >&2
  exit 1
fi

"${DOCKER[@]}" exec "$WEB_CONTAINER" \
  node_modules/.bin/tsx --conditions=react-server scripts/cron/backup-heartbeat.ts
