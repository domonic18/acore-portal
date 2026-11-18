/**
 * 备份心跳检查(cron):读 COS 备份清单,判业务库备份是否在预期窗口内完成。
 *
 * 与备份脚本分离:备份脚本「成功」不等于「按时跑过」——crontab 没挂、容器起不来、
 * 脚本被改坏,都可能让备份静默不跑。本脚本读清单里的最新完成时刻,
 * 超阈值即判心跳缺失并告警(退出码 2,与对账脚本的「有差异」同义)。
 *
 * 用法:tsx --conditions=react-server scripts/cron/backup-heartbeat.ts [--target business]
 */
import { getConfig } from "../../src/lib/config";
import { BACKUP_HEARTBEAT_MAX_AGE_HOURS, BACKUP_TARGET, type BackupTarget } from "../../src/constants/backup";
import {
  buildBackupHeartbeatCard,
  emptyManifest,
  latestManifestEntry,
  type BackupManifest,
} from "./backup-lib";
import { createCosClient, getBuffer, type CosCredentials } from "./backup-cos";
import { describeAlert, sendOpsAlert } from "./ops-alert";
import { BACKUP_MANIFEST_KEY } from "../../src/constants/backup";

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const rawTarget = argValue("--target") ?? BACKUP_TARGET.business;
  const target: BackupTarget =
    rawTarget === BACKUP_TARGET.wpLegacy ? BACKUP_TARGET.wpLegacy : BACKUP_TARGET.business;

  const cfg = await getConfig();
  const cos = cfg.cos;
  if (!cos) throw new Error("COS 未配置(system_config 缺 cos.* 键组),心跳检查不可用");
  const creds: CosCredentials = {
    bucket: cos.bucket,
    region: cos.region,
    secretId: cos.secretId,
    secretKey: cos.secretKey,
  };
  const client = createCosClient(creds);

  const buf = await getBuffer(client, creds, BACKUP_MANIFEST_KEY);
  let manifest: BackupManifest = emptyManifest();
  if (buf) {
    try {
      const parsed = JSON.parse(buf.toString("utf8")) as BackupManifest;
      if (parsed?.version === 1 && Array.isArray(parsed.entries)) manifest = parsed;
    } catch {
      manifest = emptyManifest();
    }
  }

  const last = latestManifestEntry(manifest, target);
  const ageHours = last
    ? (Date.now() - new Date(last.createdAt).getTime()) / 3_600_000
    : null;
  const maxAge = BACKUP_HEARTBEAT_MAX_AGE_HOURS;

  if (ageHours !== null && ageHours <= maxAge) {
    console.log(
      `[backup-heartbeat] ok: ${target} 最近备份 ${last?.createdAt} (${ageHours.toFixed(1)} 小时前)`,
    );
    return;
  }

  console.error(
    `[backup-heartbeat] 心跳缺失: ${target} ${last ? `最近备份 ${last.createdAt}` : "无任何备份记录"}` +
      `(阈值 ${maxAge} 小时)`,
  );
  const outcome = await sendOpsAlert(
    cfg,
    buildBackupHeartbeatCard({ last, ageHours, maxAgeHours: maxAge }),
  );
  console.error(`[backup-heartbeat] 告警卡片:${describeAlert(outcome)}`);
  process.exitCode = 2;
}

void main().catch((err) => {
  console.error(
    `[backup-heartbeat] 失败: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
