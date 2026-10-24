import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";

/**
 * 系统配置唯一入口:SMTP/SOAP/游戏库连接串/站点地址等业务通道配置存 system_config 表,
 * env 仅存业务库/Redis 连接串与会话签名密钥(宪法 v1.0.2)。
 * 启动时经 instrumentation 预热 fail-fast;运行期读进程内缓存,
 * 管理端变更配置后调 reloadSystemConfig 写穿失效。凭据值禁止打印/落日志。
 */
const configSchema = z.object({
  app: z.object({
    url: z.string().url(),
  }),
  soap: z.object({
    url: z.string().url(),
    user: z.string().min(1),
    password: z.string().min(1),
    realm: z.string().default("Dev"),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive(),
    user: z.string().default(""),
    password: z.string().default(""),
    from: z.string().email(),
  }),
  // 游戏四库连接串(auth 库账号须具备 account 表写权限,根本防线 research R5);
  // 进程内惰性建连,改库连接需重启生效
  gamedb: z.object({
    auth: z.string().url(),
    characters: z.string().url(),
    world: z.string().url(),
    eluna: z.string().url(),
  }),
});

export type SystemConfig = z.infer<typeof configSchema>;

let cache: SystemConfig | null = null;

function flattenToSchema(rows: { key: string; value: string }[]) {
  const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    app: { url: flat["app.url"] },
    soap: {
      url: flat["soap.url"],
      user: flat["soap.user"],
      password: flat["soap.password"],
      realm: flat["soap.realm"],
    },
    smtp: {
      host: flat["smtp.host"],
      port: flat["smtp.port"],
      user: flat["smtp.user"] ?? "",
      password: flat["smtp.password"] ?? "",
      from: flat["smtp.from"],
    },
    gamedb: {
      auth: flat["gamedb.auth"],
      characters: flat["gamedb.characters"],
      world: flat["gamedb.world"],
      eluna: flat["gamedb.eluna"],
    },
  };
}

function parseConfig(raw: ReturnType<typeof flattenToSchema>): SystemConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // 只报缺失/格式,不回显任何值
    throw new Error(`system_config 配置校验失败(检查 system_config 表): ${issues}`);
  }
  return parsed.data;
}

export async function loadSystemConfig(): Promise<SystemConfig> {
  const rows = await prisma.systemConfig.findMany({
    select: { key: true, value: true },
  });
  return parseConfig(flattenToSchema(rows));
}

/** 读配置(首次调用查库并缓存;之后读缓存) */
export async function getConfig(): Promise<SystemConfig> {
  if (!cache) {
    cache = await loadSystemConfig();
  }
  return cache;
}

export async function reloadSystemConfig(): Promise<SystemConfig> {
  cache = await loadSystemConfig();
  return cache;
}
