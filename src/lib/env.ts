import { z } from "zod";

/**
 * 基础设施连接凭据唯一入口:模块加载即校验,fail-fast(宪法 v1.0.2)。
 * 仅业务库/Redis 连接串与会话签名密钥;游戏库连接串与业务通道配置
 * (SMTP/SOAP/站点地址等)存 system_config 表,见 lib/config.ts。
 * 凭据仅存 env,禁止打印值本身。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // 业务库(可写迁移;system_config 表所在库,引导级凭据)
  DATABASE_URL: z.string().url(),

  // Redis(session/限速/热点缓存)
  REDIS_URL: z.string().url(),

  // 会话签名密钥:Edge middleware 运行时查不了 MySQL,属基础设施凭据留 env(宪法 v1.0.2)
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET 至少 16 字符"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // 只报缺失/格式,不回显任何值
    throw new Error(`环境变量校验失败(检查 .env): ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
