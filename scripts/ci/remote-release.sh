#!/usr/bin/env bash
# 生产发布的远端执行器(CI 侧唯一入口):预检 → 同步资产 → 后台发布 → 轮询退出码。
#
# 为什么要有这个脚本(2026-11-14 生产发布失败 exit 255 的根因):
#   早前发布是一条前台 ssh:远端跑 deploy.sh,输出直接回灌 Actions 日志。
#   两个缺陷叠在一起:
#     ① **迁移步骤静默 15 分半**——migrate 服务在生产机上用 npx 现下载 prisma CLI
#        (npm registry 国内链路 ~170KB/s),期间 ssh 连接完全空闲;
#     ② **ssh 未带保活**——产线 sshd `clientaliveinterval 0`(不杀空闲会话),
#        链路上有 15 分钟空闲 TCP 超时 ⇒ 连接被 RST 断开,远端 deploy.sh 随 SIGHUP 中断。
#   即「慢」本身不致命,致命的是「慢 + 会话会被掐」⇒ 发布做到一半被杀。
#   修法落在机制层(不是加长超时):
#     - 远端 `setsid` **后台执行**,写日志与退出码文件 ⇒ SSH 断连不影响发布继续;
#     - CI **轮询退出码文件**并回显远端日志 ⇒ 成败判定与日志都不依赖会话存活;
#     - 所有 ssh/scp 一律带 `ServerAliveInterval` ⇒ 空闲不再被掐;
#     - 迁移工具改为镜像内置(见 docker/web/Dockerfile)⇒ 迁移步骤本身也是秒级的。
#   副作用是好的:发布不再被会话生命周期绑架,CI 崩了远端发布照样跑完。
#
# 契约(全部由调用方注入,脚本内不写死任何主机路径与凭据):
#   DEPLOY_HOST        生产机(必填)
#   DEPLOY_PATH        生产机上的部署根(必填)
#   DEPLOY_NAMESPACE   TCR 命名空间(必填;镜像全路径 = registry/namespace/acore-portal)
#   DEPLOY_TAG         本次发布的镜像 tag(形如 main-xxxxxxx)
#   DEPLOY_SSH_KEY     私钥路径(默认 ~/.ssh/deploy_key)
#   DEPLOY_KNOWN_HOSTS 主机指纹(默认 ~/.ssh/known_hosts)
#   REMOTE_LOG/REMOTE_EXIT  远端日志/退出码文件路径(默认部署根下的 .deploy-log/.deploy-exit)
#   POLL_INTERVAL      轮询间隔秒(默认 15)
#   MAX_WAIT_SECONDS   最长等待秒(默认 2400)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:?必须指定 DEPLOY_HOST}"
DEPLOY_PATH="${DEPLOY_PATH:?必须指定 DEPLOY_PATH}"
DEPLOY_NAMESPACE="${DEPLOY_NAMESPACE:?必须指定 DEPLOY_NAMESPACE}"
DEPLOY_TAG="${DEPLOY_TAG:?必须指定 DEPLOY_TAG(形如 main-xxxxxxx)}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/deploy_key}"
DEPLOY_KNOWN_HOSTS="${DEPLOY_KNOWN_HOSTS:-$HOME/.ssh/known_hosts}"
REMOTE_LOG="${REMOTE_LOG:-$DEPLOY_PATH/.deploy-log}"
REMOTE_EXIT="${REMOTE_EXIT:-$DEPLOY_PATH/.deploy-exit}"
POLL_INTERVAL="${POLL_INTERVAL:-15}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-2400}"

log() { printf '\n=== %s ===\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

# 保活三件套:ServerAliveInterval=30 + CountMax=6 ⇒ 链路静默 3 分钟即发一次探测包,
# 连续 6 次(3 分钟)无应答才判死。**空闲会话不再被中间链路的 15 分钟超时掐断**。
SSH_OPTS=(-i "$DEPLOY_SSH_KEY" -o StrictHostKeyChecking=yes
          -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -o ConnectTimeout=20)

remote() { ssh "${SSH_OPTS[@]}" "$DEPLOY_HOST" "$@"; }

# ---------------------------------------------------------------- 预检

log "预检"
[ -f "$DEPLOY_SSH_KEY" ] || die "私钥不存在:$DEPLOY_SSH_KEY"
[ -f "$DEPLOY_KNOWN_HOSTS" ] || die "主机指纹不存在:$DEPLOY_KNOWN_HOSTS"
echo "$DEPLOY_TAG" | grep -Eq '^(main|develop)-[0-9a-f]{7,40}$' \
  || die "非法镜像 tag:$DEPLOY_TAG(须形如 main-xxxxxxx)"
remote "cd '$DEPLOY_PATH' || { echo 'ERROR: 部署目录不存在:$DEPLOY_PATH' >&2; exit 1; }; \
        sudo docker compose version >/dev/null 2>&1 \
          || { echo 'ERROR: 生产机缺少 compose v2 CLI 插件(docker compose 不可用)' >&2; exit 1; }; \
        echo '生产机预检通过'"

# 记录发布前现场:只读,不该因某个文件不存在而失败(首次 CI 发布时 .deploy-state 与
# .env.prod 的 WEB_IMAGE 都还没有)——每段各自兜住,不用 && 串。
log "发布前现场"
remote "cd '$DEPLOY_PATH' || exit 1; \
        echo '--- 当前状态文件 ---'; cat .deploy-state 2>/dev/null || echo '(无)'; \
        echo '--- 当前镜像钉 ---'; grep -E '^WEB_IMAGE=' .env.prod 2>/dev/null || echo '(未钉)'; \
        echo '--- 当前运行镜像 ---'; \
        sudo docker compose --env-file .env.prod -f docker/docker-compose.prod.yml ps 2>/dev/null || true; \
        exit 0"

# ---------------------------------------------------------------- 同步资产

log "同步部署资产"
# COPYFILE_DISABLE:macOS 上打包不夹带 AppleDouble(._*)垃圾文件
# prisma/schema-business 一并下发:迁移集必须与本次发布的镜像同源,
# 否则服务器上的旧迁移集会让新代码读不到新列(台账断言会当场拦下)
ASSETS=(
  scripts/deploy.sh
  prisma/schema-business
  docker/docker-compose.prod.yml
  docker/caddy/Caddyfile
  docker/nginx-stream/nginx.conf.template
  docker/web/Dockerfile
  # 宿主侧备份编排脚本:crontab 跑的是**宿主上这份**,而 dump 参数/排除清单由镜像内的
  # backup.ts 打印 ⇒ 两份不同源就会漂(宿主的排除参数过期 ⇒ dump 与判据口径不符)。
  # 随发布同步 ⇒ 宿主脚本与镜像同 commit(2026-11-15 首次生产备份时手工拷过一遍,属隐患)。
  scripts/cron/backup-run.sh
  scripts/cron/backup-heartbeat-run.sh
)
TARBALL_DIR="$(mktemp -d)"
TARBALL="$TARBALL_DIR/deploy-assets.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$TARBALL" -C "$REPO_ROOT" "${ASSETS[@]}"
scp "${SSH_OPTS[@]}" "$TARBALL" "$DEPLOY_HOST:/tmp/deploy-assets.tar.gz"
rm -rf "$TARBALL_DIR"
remote sudo bash -s -- "$DEPLOY_PATH" <<'REMOTE'
set -eu
cd "$1"
# --no-same-owner:不让归档里的 uid/gid 覆盖服务器属主
tar --no-same-owner -xzf /tmp/deploy-assets.tar.gz
rm -f /tmp/deploy-assets.tar.gz
chmod 755 scripts/deploy.sh scripts/cron/backup-run.sh scripts/cron/backup-heartbeat-run.sh
# 资产落地完整性校验:缺任何一项都中止,不带着半套资产继续发布
for f in scripts/deploy.sh prisma/schema-business/schema.prisma docker/docker-compose.prod.yml \
         docker/caddy/Caddyfile docker/nginx-stream/nginx.conf.template docker/web/Dockerfile \
         scripts/cron/backup-run.sh scripts/cron/backup-heartbeat-run.sh; do
    [ -f "$f" ] || { echo "ERROR: 资产缺失:$f" >&2; exit 1; }
done
echo "--- 已同步:发布资产齐全 ---"
REMOTE

# ---------------------------------------------------------------- 后台发布 + 轮询

log "启动远端发布(后台执行)"
# setsid:脱离当前会话 ⇒ SSH 断开(SIGHUP)不会波及发布进程。
# 退出码写进独立文件(不是靠 SSH 退出码)⇒ 成败判定与会话存活彻底解耦。
remote sudo bash -s -- "$DEPLOY_PATH" "$DEPLOY_TAG" "$DEPLOY_NAMESPACE" "$REMOTE_LOG" "$REMOTE_EXIT" <<'REMOTE'
set -eu
deploy_path="$1"; tag="$2"; ns="$3"; log="$4"; exitf="$5"
cd "$deploy_path"
rm -f "$exitf"
# setsid(脱离会话)优先;机器上若没有 setsid,退回 nohup(忽略 SIGHUP)——
# 两条路都能保证「SSH 断开不打断发布」,但 setsid 更彻底(不占着会话的控制终端)。
detacher="setsid"
command -v setsid >/dev/null 2>&1 || detacher="nohup"
"$detacher" bash -c "cd '$deploy_path' && DEPLOY_ROOT='$deploy_path' DEPLOY_NAMESPACE='$ns' \
  bash scripts/deploy.sh --env prod --tag '$tag' > '$log' 2>&1; printf '%s' \$? > '$exitf'" \
  </dev/null >/dev/null 2>&1 &
echo "远端发布已启动:tag=$tag 日志=$log"
REMOTE

log "等待远端发布完成(轮询退出码文件,间隔 ${POLL_INTERVAL}s)"
deadline=$(( $(date +%s) + MAX_WAIT_SECONDS ))
while :; do
  # `|| true`:轮询期间的一次瞬时 ssh 失败不该让 CI 判红——远端发布本就在后台跑,
  # 监控断一下不影响它继续;真正判成败的是退出码文件。
  code="$(remote "cat '$REMOTE_EXIT' 2>/dev/null || true" || true)"
  code="$(printf '%s' "$code" | tr -cd '0-9')"
  if [ -n "$code" ]; then
    log "远端发布结束,退出码=$code"
    remote "cat '$REMOTE_LOG' 2>/dev/null || true"
    exit "$code"
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    printf '✗ 等待远端发布超时(%ss);发布**可能仍在跑**,勿重复触发——先查远端日志:\n' "$MAX_WAIT_SECONDS" >&2
    remote "tail -n 50 '$REMOTE_LOG' 2>/dev/null || true" >&2
    exit 124
  fi
  remote "tail -n 12 '$REMOTE_LOG' 2>/dev/null || true" || true
  sleep "$POLL_INTERVAL"
done
