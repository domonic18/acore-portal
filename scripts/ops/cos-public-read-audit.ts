/**
 * COS 存量媒体对象 public-read 完整性体检(只读为主)。
 *
 * 背景:WP→门户切换时把存量媒体(约 1.5 万个对象)整体上传到 COS 桶,桶默认
 * private ⇒ 切换当晚前台图片全量 403。补救动作是把媒体对象补齐为 public-read
 * (可匿名读),但「补齐」是否**覆盖全部存量对象**需要可复核的结论——
 * 本脚本逐对象读 ACL,列出仍不可匿名读的对象。
 *
 * 口径:
 * - 备份前缀(`backups/`)按设计就是私有的(备份制品不外露)⇒ 默认跳过;
 * - 只报告不自动改:需补齐时显式加 `--fix` 才会把对象 ACL 改成 public-read;
 * - 桶级已是 public-read ⇒ 全部对象可匿名读,直接出结论;
 * - 差异非空退出码 2(供监控/人工跟进)。
 *
 * 用法(在 web 容器内跑,凭据取 system_config 的 cos.*):
 *   tsx --conditions=react-server scripts/ops/cos-public-read-audit.ts
 *   tsx --conditions=react-server scripts/ops/cos-public-read-audit.ts --fix
 *   tsx --conditions=react-server scripts/ops/cos-public-read-audit.ts --prefix 2023/
 */
import { getConfig } from "../../src/lib/config";
import { createCosClient, type CosCredentials } from "../cron/backup-cos";

/** 备份制品前缀:按设计私有,体检默认跳过 */
const PRIVATE_PREFIXES = ["backups/"];

/** 并发度(逐对象读 ACL;1.5 万对象串行太慢) */
const CONCURRENCY = 20;

/** 报告里最多列出的问题对象数 */
const MAX_REPORT = 30;

type CosObject = { Key?: string };

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

/** 列出桶内对象键(分页游标循环) */
async function listAllKeys(
  client: ReturnType<typeof createCosClient>,
  creds: CosCredentials,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let marker = "";
  for (;;) {
    const res = (await client.getBucket({
      Bucket: creds.bucket,
      Region: creds.region,
      Prefix: prefix,
      ...(marker ? { Marker: marker } : {}),
      MaxKeys: 1000,
    })) as unknown as {
      Contents?: CosObject[];
      NextMarker?: string;
      IsTruncated?: string | boolean;
    };
    for (const item of res.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    const truncated = res.IsTruncated === true || res.IsTruncated === "true";
    const next = res.NextMarker ?? "";
    if (!truncated || !next) break;
    marker = next;
  }
  return keys;
}

/** 读对象 ACL(取不到按「不可匿名读」处理) */
async function objectAcl(
  client: ReturnType<typeof createCosClient>,
  creds: CosCredentials,
  key: string,
): Promise<string> {
  try {
    const res = (await client.getObjectAcl({
      Bucket: creds.bucket,
      Region: creds.region,
      Key: key,
    })) as { ACL?: string };
    return res.ACL ?? "unknown";
  } catch {
    return "unreadable";
  }
}

/** 把对象 ACL 改成 public-read */
async function setPublicRead(
  client: ReturnType<typeof createCosClient>,
  creds: CosCredentials,
  key: string,
): Promise<boolean> {
  try {
    await client.putObjectAcl({
      Bucket: creds.bucket,
      Region: creds.region,
      Key: key,
      ACL: "public-read",
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const cfg = await getConfig();
  const cos = cfg.cos;
  if (!cos) throw new Error("COS 未配置(system_config 缺 cos.* 键组)");
  const creds: CosCredentials = {
    bucket: argValue("--bucket") || cos.bucket,
    region: cos.region,
    secretId: cos.secretId,
    secretKey: cos.secretKey,
  };
  const client = createCosClient(creds);
  const prefix = argValue("--prefix") ?? "";
  const fix = process.argv.includes("--fix");

  // 桶级 ACL:public-read ⇒ 对象默认继承,无需逐个看
  let bucketAcl = "unknown";
  try {
    const res = (await client.getBucketAcl({ Bucket: creds.bucket, Region: creds.region })) as {
      ACL?: string;
    };
    bucketAcl = res.ACL ?? "unknown";
  } catch {
    // 读不到桶 ACL 不阻断:退化为逐对象读
  }

  const allKeys = await listAllKeys(client, creds, prefix);
  const keys = allKeys.filter(
    (k) => !PRIVATE_PREFIXES.some((p) => k.startsWith(p)),
  );
  const skipped = allKeys.length - keys.length;

  console.log(
    `[cos-public-read] 桶 ${creds.bucket} 前缀「${prefix || "(全部)"}」:` +
      `对象 ${allKeys.length} 个(跳过私有备份前缀 ${skipped} 个),桶级 ACL=${bucketAcl}`,
  );

  if (bucketAcl === "public-read") {
    console.log("[cos-public-read] 桶级已是 public-read:全部对象可匿名读,无需逐个补齐。");
    return;
  }

  const bad: { key: string; acl: string }[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, keys.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= keys.length) return;
      const key = keys[idx] as string;
      const acl = await objectAcl(client, creds, key);
      if (acl !== "public-read") bad.push({ key, acl });
    }
  });
  await Promise.all(workers);

  if (bad.length === 0) {
    console.log(`[cos-public-read] ok: ${keys.length} 个对象全部为 public-read。`);
    return;
  }

  console.error(`[cos-public-read] ${bad.length} 个对象不可匿名读:`);
  for (const item of bad.slice(0, MAX_REPORT)) {
    console.error(`  ${item.acl}  ${item.key}`);
  }
  if (bad.length > MAX_REPORT) {
    console.error(`  …另有 ${bad.length - MAX_REPORT} 个未列出`);
  }

  if (!fix) {
    console.error("[cos-public-read] 只报告不修改;补齐请显式加 --fix 重跑。");
    process.exitCode = 2;
    return;
  }

  let fixed = 0;
  for (const item of bad) {
    if (await setPublicRead(client, creds, item.key)) fixed++;
  }
  console.log(`[cos-public-read] 已补齐 public-read:${fixed}/${bad.length} 个`);
  if (fixed < bad.length) process.exitCode = 2;
}

void main().catch((err) => {
  console.error(`[cos-public-read] 失败: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
