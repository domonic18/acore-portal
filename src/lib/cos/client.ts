import type Cos from "cos-nodejs-sdk-v5";
import { getConfig } from "@/lib/config";

/**
 * 腾讯云 COS client(research R8):配置经 system_config(宪法 VI 配置分域),
 * 惰性建连——cos.* 未配置时首次使用抛错而非启动失败。
 * M2 消费方仅迁移脚本(scripts/migrate/cos-upload.mjs),运行期读图走 CDN 直链不经 SDK。
 */
type CosConfig = NonNullable<Awaited<ReturnType<typeof getConfig>>["cos"]>;

let cached: { client: Cos; config: CosConfig } | null = null;

/** 未配置 ≠ 故障:媒体服务据此回退本地存储,迁移脚本仍视为硬错误 */
export class CosNotConfiguredError extends Error {
  constructor() {
    super("COS 未配置(system_config 缺少 cos.* 键组)");
    this.name = "CosNotConfiguredError";
  }
}

export async function getCosConfig(): Promise<CosConfig> {
  const cos = (await getConfig()).cos;
  if (!cos) throw new CosNotConfiguredError();
  return cos;
}

/** 幂等获取 COS SDK 实例 */
export async function getCosClient(): Promise<{ client: Cos; config: CosConfig }> {
  if (cached) return cached;
  const config = await getCosConfig();
  const { default: Cos } = await import("cos-nodejs-sdk-v5");
  const client = new Cos({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
  cached = { client, config };
  return cached;
}
