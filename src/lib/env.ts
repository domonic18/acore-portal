import { z } from "zod";

/**
 * 环境变量唯一入口:模块加载即校验,fail-fast。
 * 凭据仅存 env,禁止打印值本身(宪法 V/VI)。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET 至少 16 字符"),

  // 业务库(可写迁移)
  DATABASE_URL: z.string().url(),

  // 游戏四库:auth 库使用具备 account 表写权限的连接账号(根本防线,research R5)
  GAME_DB_AUTH_URL: z.string().url(),
  GAME_DB_CHARACTERS_URL: z.string().url(),
  GAME_DB_WORLD_URL: z.string().url(),
  GAME_DB_ELUNA_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  SOAP_URL: z.string().url(),
  SOAP_USER: z.string().min(1),
  SOAP_PASSWORD: z.string().min(1),
  SOAP_REALM: z.string().default("Dev"),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM: z.string().email(),

  // M4 启用(Turnstile + 限速为公网暴露前硬性要求)
  TURNSTILE_SITE_KEY: z.string().default(""),
  TURNSTILE_SECRET_KEY: z.string().default(""),

  // M2+ 对象存储
  COS_SECRET_ID: z.string().default(""),
  COS_SECRET_KEY: z.string().default(""),
  COS_BUCKET: z.string().default(""),
  COS_REGION: z.string().default(""),
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
