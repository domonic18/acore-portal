#!/usr/bin/env bash
# 构建元信息单一来源(CI 构建与本地兜底构建共用):
#
# 输出三行 KEY=value:
#   sha_short   —— 提交短号(7 位)
#   branch      —— 分支名(斜杠已换连字符,可直接作镜像 tag 片段;detached HEAD 时为空)
#   build_time  —— 构建时间,固定东八区(Asia/Shanghai),格式 "YYYY-MM-DD HH:mm"
#
# 为什么要单一口径:页脚「构建于」行是人工核对线上版本的唯一凭据,一旦随构建机
# 时区漂移就失去意义(2026-11-14 实测:CI 侧曾用 `date -u` 输出 UTC,页脚显示的
# 构建时间比北京时间差 8 小时;而本地兜底构建走 deploy.sh 的东八区取值,
# 同一字段两套时区两套格式)。故 build_time 显式指定时区,构建机在哪都取东八区。
#
# 用法:
#   scripts/ci/build-meta.sh                     # 从当前 git 检出推导
#   scripts/ci/build-meta.sh --branch main       # 指定分支(CI 的 checkout 是 detached HEAD,取不到分支名)
#   scripts/ci/build-meta.sh --sha <full-sha>    # 指定提交(发布资产根与脚本所在目录可能不同)
#   scripts/ci/build-meta.sh --field build_time  # 只输出单个字段的值
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

branch=""
sha_full=""
field=""
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="${2:-}"; shift 2;;
    --sha)    sha_full="${2:-}"; shift 2;;
    --field)  field="${2:-}"; shift 2;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0;;
    *) echo "未知参数: $1" >&2; exit 2;;
  esac
done

cd "$REPO_ROOT"

if [ -z "$branch" ]; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  # CI 的 checkout 处于 detached HEAD(abbrev-ref = HEAD),此时须由调用方用 --branch 传入
  [ "$branch" = "HEAD" ] && branch=""
fi
branch="${branch//\//-}"

if [ -z "$sha_full" ]; then
  sha_full="$(git rev-parse HEAD 2>/dev/null || echo "")"
fi
sha_short="${sha_full:0:7}"

# 构建时间:显式东八区,不依赖构建机时区(见文件头)
build_time="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"

if [ -n "$field" ]; then
  case "$field" in
    sha_short)  printf '%s\n' "$sha_short";;
    branch)     printf '%s\n' "$branch";;
    build_time) printf '%s\n' "$build_time";;
    *) echo "未知字段: $field" >&2; exit 2;;
  esac
  exit 0
fi

printf 'sha_short=%s\nbranch=%s\nbuild_time=%s\n' "$sha_short" "$branch" "$build_time"
