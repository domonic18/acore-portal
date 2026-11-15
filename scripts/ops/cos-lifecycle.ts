/**
 * COS 桶生命周期规则(备份制品兜底清理)。
 *
 * 分层口径:保留期是**策略**(脚本每次备份末尾按 `backup.retentionDays` 删),
 * 生命周期是**兜底**(脚本不跑时桶自己删)。兜底线必须 ≥ 任何可能的策略值,
 * 否则后台把保留期调大、桶规则却先把旧备份删了 ⇒ 设置会说谎。
 * 故:生命周期 = 365 天,后台保留期上限也是 365 天。
 *
 * 规则只针对备份前缀,媒体对象(其它前缀)一律不动:
 *   backups/db/lokta-business-  → 365 天后删除(兜底)
 *   backups/db/lokta-wp-legacy- → 不设规则(存量库已冻结,归档永久保留)
 *   backups/manifest.json        → 不设规则(台账,长期留证)
 *
 * 用法(在 web 容器内跑,凭据取 system_config 的 cos.*):
 *   tsx --conditions=react-server scripts/ops/cos-lifecycle.ts [--bucket <桶名>] [--dry-run]
 */
import { getConfig } from "../../src/lib/config";
import { createCosClient, type CosCredentials } from "../cron/backup-cos";

/** 备份制品兜底保留天数(须 ≥ 后台保留期上限) */
const BACKUP_LIFECYCLE_DAYS = 365;

type LifecycleRule = {
  ID: string;
  Filter: { Prefix: string };
  Status: "Enabled" | "Disabled";
  Expiration: { Days: number };
  AbortIncompleteMultipartUpload?: { DaysAfterInitiation: number };
};

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
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

  const rules: LifecycleRule[] = [
    {
      ID: "backup-business-expire",
      Filter: { Prefix: "backups/db/lokta-business-" },
      Status: "Enabled",
      Expiration: { Days: BACKUP_LIFECYCLE_DAYS },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
    },
  ];

  if (process.argv.includes("--dry-run")) {
    console.log(`[cos-lifecycle] 桶 ${creds.bucket} 将写入的规则:`);
    for (const rule of rules) {
      console.log(`  ${rule.ID}: 前缀 ${rule.Filter.Prefix} → ${rule.Expiration.Days} 天后删除`);
    }
    return;
  }

  await client.putBucketLifecycle({
    Bucket: creds.bucket,
    Region: creds.region,
    Rules: rules,
  });
  console.log(
    `[cos-lifecycle] 桶 ${creds.bucket} 生命周期已写入:` +
      rules.map((r) => `${r.Filter.Prefix}→${r.Expiration.Days}天`).join(", "),
  );
}

void main().catch((err) => {
  console.error(`[cos-lifecycle] 失败: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
