# 多阶段构建(照内部同族项目的 prod 口径):builder 全量依赖产出构建物,
# runtime 仅留生产依赖。非 standalone 红线不变——
# 规避 5 个 Prisma client 二进制引擎在 outputFileTracing 下的追踪缺失风险,
# 故 runtime 保留真实 node_modules(symlink 结构)而非 standalone 精简产物。
# 构建期注入占位 env:仅为满足 src/lib/env.ts 模块加载 fail-fast 校验,
# 运行时真实值以 compose env_file(.env.test/.env.prod)为准;
# runtime 层不再烘焙占位 env,缺失时 fail-fast 如实报错。
#
# 构建信息(BUILD_TIME/APP_SHA)同理走构建期内联:NEXT_PUBLIC_* 由 next build
# 固化进产物,运行期不再依赖 env,避免「容器 env 与镜像产物说法不一致」。
# 缺省 unknown → 页面据此不渲染构建信息行(本地手工构建的情形)。
FROM node:22-slim AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# lockfileVersion 9.0 → pnpm 9
RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm db:generate

ENV NODE_ENV=production \
  SESSION_SECRET="build-time-placeholder-secret-000000" \
  DATABASE_URL="mysql://build:build@localhost:3306/build" \
  REDIS_URL="redis://localhost:6379/0"

# 构建信息:自动部署由 CI(.github/workflows/release-image.yml)或本地兜底
# (scripts/deploy.sh --build-local)以 --build-arg 传入,取值同源于 scripts/ci/build-meta.sh
ARG BUILD_TIME=unknown
ARG APP_SHA=unknown
ENV NEXT_PUBLIC_BUILD_TIME=$BUILD_TIME \
  NEXT_PUBLIC_APP_SHA=$APP_SHA

RUN pnpm build

# 瘦身四连:重装纯生产依赖(lockfile 确定性,store 已暖近乎零下载)、
# 弃 .next/cache(构建缓存,运行时无用)、清 pnpm store(~758MB)、
# 裁 musl 变体 swc(pnpm 对 os/arch 匹配的可选依赖全量安装,
# Debian=glibc 基底永远用 gnu 变体,musl 纯冗余 ~134MB;与 arch 无关,x86 同样适用)
RUN rm -rf node_modules /app/.next/cache \
  && pnpm install --prod --frozen-lockfile \
  && rm -rf /root/.local/share/pnpm \
  && rm -rf node_modules/.pnpm/@next+swc-linux-*musl* \
  && find node_modules -lname '*swc-linux-*musl*' -delete

FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 迁移工具烘焙进镜像(与 node_modules 瘦身无关,单独装在 /opt/prisma):
#   migrate 一次性服务改用本镜像跑 `prisma migrate deploy`。
#   早前它用 node:22-slim + `npx --yes prisma@6.19.3` **在生产机上现下载**,
#   实测耗 15 分半且全程零输出(npm registry 国内链路 ~170KB/s)——
#   迁移步骤成了发布耗时的头号大头,且 `run --rm` 每次新容器不保留 npm 缓存,
#   每次发布都重下。内置后迁移步骤秒级完成,发布链路不再依赖外网。
#   版本与 pnpm-lock.yaml 锁定的 6.19.3 一致(升级须同步 docker-compose.*.yml 的 migrate 服务)。
RUN npm install -g --prefix /opt/prisma prisma@6.19.3 \
  && npm cache clean --force \
  && rm -rf /root/.npm

WORKDIR /app
# pnpm 的 node_modules 为相对 symlink(.pnpm 虚拟 store),整树 COPY 后自洽
COPY --from=builder /app ./

ENV NODE_ENV=production
# 迁移工具在 PATH 里(migrate 一次性服务直接 `prisma migrate deploy`,不再 npx 现下载)
ENV PATH="/opt/prisma/bin:$PATH"
EXPOSE 3000
# 直启 next,免全局 pnpm(runtime 阶段无 pnpm)
CMD ["node", "node_modules/next/dist/bin/next", "start"]
