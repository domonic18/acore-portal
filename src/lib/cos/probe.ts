import "server-only";

/**
 * COS 连通探测(后台「测试连接」用):
 * 用候选凭据临时建 client,只做 headBucket(读桶元信息,不改对象)。
 * SDK 为动态 import——保持 node-only 依赖不进启动链(AGENTS.md 目录规范第 8 条)。
 */

export type CosProbeResult = { ok: boolean; message: string };

export async function probeCos(
  params: { bucket: string; region: string; secretId: string; secretKey: string },
): Promise<CosProbeResult> {
  try {
    const { default: Cos } = await import("cos-nodejs-sdk-v5");
    const client = new Cos({
      SecretId: params.secretId,
      SecretKey: params.secretKey,
    });
    await client.headBucket({ Bucket: params.bucket, Region: params.region });
    return { ok: true, message: "COS 桶可访问" };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, message: raw.split("\n")[0]?.slice(0, 200) || "连接失败" };
  }
}
