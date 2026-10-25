# 多阶段构建(照 ai-invest prod 口径):builder 全量依赖产出构建物,
# runtime 仅留生产依赖。非 standalone 红线不变——
# 规避 5 个 Prisma client 二进制引擎在 outputFileTracing 下的追踪缺失风险,
# 故 runtime 保留真实 node_modules(symlink 结构)而非 standalone 精简产物。
# 构建期注入占位 env:仅为满足 src/lib/env.ts 模块加载 fail-fast 校验,
# 运行时真实值以 compose env_file(.env.test/.env.prod)为准;
# runtime 层不再烘焙占位 env,缺失时 fail-fast 如实报错。
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

WORKDIR /app
# pnpm 的 node_modules 为相对 symlink(.pnpm 虚拟 store),整树 COPY 后自洽
COPY --from=builder /app ./

ENV NODE_ENV=production
EXPOSE 3000
# 直启 next,免全局 pnpm(runtime 阶段无 pnpm)
CMD ["node", "node_modules/next/dist/bin/next", "start"]
