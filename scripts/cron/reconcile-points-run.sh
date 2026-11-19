#!/usr/bin/env bash
# 积分日终对账(宿主编排;crontab 入口,每日)
#
# 账实一致是积分铁律(余额必须能由流水重算推导),本脚本只报告不修复:
# 有差异即退出码 2,并同步飞书红卡;无差异同步蓝卡(兼作「任务确实在跑」的心跳)。
#
# 对账逻辑在容器内跑(scripts/cron/reconcile-points.ts,与备份/心跳/会话清理同套路):
# 容器才有业务库连接串与 node_modules/tsx。
#
# 退出码:0 账实一致;2 存在差异;1 脚本失败。
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

# --conditions=react-server:告警链走 server-only 服务层(飞书卡片与系统配置读取),
# 缺这个条件时模块导入会失败——脚本会降级为只记日志(不崩,但不发卡)。
"${DOCKER[@]}" exec "$WEB_CONTAINER" \
  node_modules/.bin/tsx --conditions=react-server scripts/cron/reconcile-points.ts
