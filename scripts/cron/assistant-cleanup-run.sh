#!/usr/bin/env bash
# 助手会话超期清理(宿主编排;crontab 入口,周频)
#
# 回收超过保留期(默认 30 天)的沉睡助手会话,连同 LangGraph 检查点、中间写与
# 台账行一并删除——助手对话正文每轮落一份全量快照,不回收会慢慢撑爆业务库。
#
# 清理逻辑在容器内跑(scripts/cron/assistant-cleanup.ts,与备份/心跳同套路):
# 容器才有业务库连接串与 node_modules/tsx。
#
# 退出码:0 完成(含「无超期会话」);1 失败。
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
  node_modules/.bin/tsx --conditions=react-server scripts/cron/assistant-cleanup.ts
