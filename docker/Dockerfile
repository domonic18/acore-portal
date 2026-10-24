# 生产/测试环境镜像(node:22-slim 完整依赖运行,非 standalone——
# 规避 5 个 Prisma client 二进制引擎在 outputFileTracing 下的追踪缺失风险)
# 构建期注入占位 env:仅为满足 src/lib/env.ts 模块加载 fail-fast 校验,
# 运行时真实值以 compose env_file(.env.test/.env.prod)为准
FROM node:22-slim

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

EXPOSE 3000
CMD ["pnpm", "start"]
