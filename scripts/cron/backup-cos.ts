import { createReadStream } from "node:fs";
import COS from "cos-nodejs-sdk-v5";

/**
 * COS 备份存取薄封装(cron 备份 / 心跳检查 / 恢复演练共用):
 * 凭据只在内存,不打印不落日志;所有键都走 backups/ 前缀,不与媒体对象混用。
 */

export type CosCredentials = {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
};

export function createCosClient(creds: CosCredentials): COS {
  return new COS({ SecretId: creds.secretId, SecretKey: creds.secretKey });
}

/** 上传字节流(COS 桶级 ACL 为 private,备份对象默认私有,不再单独授权) */
export async function putBuffer(
  client: COS,
  creds: CosCredentials,
  key: string,
  body: Buffer,
): Promise<void> {
  await client.putObject({
    Bucket: creds.bucket,
    Region: creds.region,
    Key: key,
    Body: body,
  });
}

/**
 * 上传本地文件(流式,大包不进内存)。
 * 生产机只有 3GB 内存,存量库 dump 压缩后仍有百兆级——整块读进 Buffer
 * 会把 web 容器推到 OOM 边缘(还要和 MySQL 抢同一台机器的内存)。
 * ContentLength 必须给,否则 SDK 无法定长。
 */
export async function putFile(
  client: COS,
  creds: CosCredentials,
  key: string,
  path: string,
  contentLength: number,
): Promise<void> {
  await client.putObject({
    Bucket: creds.bucket,
    Region: creds.region,
    Key: key,
    Body: createReadStream(path),
    ContentLength: contentLength,
  });
}

/** 取对象字节;不存在返回 null */
export async function getBuffer(
  client: COS,
  creds: CosCredentials,
  key: string,
): Promise<Buffer | null> {
  try {
    const res = await client.getObject({
      Bucket: creds.bucket,
      Region: creds.region,
      Key: key,
    });
    return Buffer.isBuffer(res.Body) ? res.Body : Buffer.from(res.Body as string);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const status = (err as { statusCode?: number })?.statusCode;
    if (code === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

/** 取对象字节数(headObject);不存在返回 null */
export async function headSize(
  client: COS,
  creds: CosCredentials,
  key: string,
): Promise<number | null> {
  try {
    const res = await client.headObject({
      Bucket: creds.bucket,
      Region: creds.region,
      Key: key,
    });
    const headers = (res as { headers?: Record<string, string> }).headers ?? {};
    const raw = headers["content-length"] ?? headers["Content-Length"];
    return raw === undefined ? null : Number(raw);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    const status = (err as { statusCode?: number })?.statusCode;
    if (code === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

/** 列出前缀下的对象键 */
export async function listKeys(
  client: COS,
  creds: CosCredentials,
  prefix: string,
): Promise<string[]> {
  const listed = await client.getBucket({
    Bucket: creds.bucket,
    Region: creds.region,
    Prefix: prefix,
  });
  const contents = (listed as { Contents?: { Key?: string }[] }).Contents ?? [];
  return contents.map((c) => c.Key ?? "").filter((k) => k.length > 0);
}

/** 批量删除(COS 单次上限 1000,超出由调用方分批) */
export async function deleteKeys(
  client: COS,
  creds: CosCredentials,
  keys: string[],
): Promise<number> {
  if (keys.length === 0) return 0;
  await client.deleteMultipleObject({
    Bucket: creds.bucket,
    Region: creds.region,
    Objects: keys.map((Key) => ({ Key })),
  });
  return keys.length;
}
