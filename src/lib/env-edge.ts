import { z } from "zod";

/**
 * Edge(middleware)运行时环境变量入口(issue #86):
 * Edge 运行时拿不到业务库/Redis 凭据,故独立于 lib/env.ts 只校验会话签名密钥——
 * middleware 不再散点直读 process.env(宪法 v1.0.2 配置分域收口)。
 * 值缺失/过短即抛错,不回显值本身。
 */
const edgeEnvSchema = z.object({
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET 至少 16 字符"),
});

export type EdgeEnv = z.infer<typeof edgeEnvSchema>;

function loadEdgeEnv(): EdgeEnv {
  const parsed = edgeEnvSchema.safeParse({
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
  if (!parsed.success) {
    throw new Error(
      "环境变量校验失败(检查 .env): SESSION_SECRET 缺失或长度不足 16 字符",
    );
  }
  return parsed.data;
}

export const edgeEnv = loadEdgeEnv();
