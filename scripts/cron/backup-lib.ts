import {
  BACKUP_COS_PREFIX,
  BACKUP_HEARTBEAT_MAX_AGE_HOURS,
  BACKUP_TARGET_META,
  type BackupTarget,
} from "../../src/constants/backup";
import { beijingDayKeyCompact, formatDateTime } from "../../src/lib/format";
import type { FeishuCard } from "../../src/server/services/shared/feishu-card";

/**
 * 备份机制纯函数层(cron 备份 / 心跳检查 / 恢复演练共用):
 * 对象命名、保留期筛选、清单合并、校验判据、告警卡片构造全收在此处,
 * 便于单测,也保证「备份脚本、演练脚本、文档」三处口径同源。
 *
 * 判据口径(AGENTS.md 备份硬约束):
 * ① 压缩包体积达下限;② gzip 可完整解开;③ COS 对象大小与本地一致;
 * ④ dump 覆盖源库全部基础表;⑤ 清单写入成功。
 * 任一不满足 = 本次备份失败(不写清单、告警、退出码非零)。
 */

export type BackupManifestEntry = {
  target: BackupTarget;
  /** 源 schema 名 */
  schema: string;
  /** COS 对象键 */
  key: string;
  /** 压缩包字节数 */
  bytes: number;
  /** 解压后字节数 */
  rawBytes: number;
  /** 压缩包 sha256(校验与人工核对用) */
  sha256: string;
  /** dump 内 CREATE TABLE 的表名 */
  tables: string[];
  /** 锚点表行数(恢复演练核对用) */
  anchors: Record<string, number>;
  /** 备份完成时刻(ISO) */
  createdAt: string;
};

export type BackupManifest = {
  version: 1;
  updatedAt: string;
  entries: BackupManifestEntry[];
};

/** 备份日期戳(北京自然日,YYYYMMDD) */
export function backupStamp(now: Date = new Date()): string {
  return beijingDayKeyCompact(now);
}

/** COS 对象键:backups/db/lokta-{target}-{yyyyMMdd}.sql.gz */
export function backupObjectKey(target: BackupTarget, stamp: string): string {
  return `${BACKUP_COS_PREFIX}lokta-${target}-${stamp}.sql.gz`;
}

/** 解析对象键回目标与日期戳;不属备份对象返回 null */
export function parseBackupObjectKey(
  key: string,
): { target: BackupTarget; stamp: string } | null {
  const m = new RegExp(`^${BACKUP_COS_PREFIX}lokta-(.+)-(\\d{8})\\.sql\\.gz$`).exec(key);
  if (!m || !m[1] || !m[2]) return null;
  const target = m[1] as BackupTarget;
  if (!(target in BACKUP_TARGET_META)) return null;
  return { target, stamp: m[2] };
}

/** 日期戳 → 北京零点的 UTC 瞬时(保留期以北京自然日为界) */
function stampToInstant(stamp: string): number {
  const y = stamp.slice(0, 4);
  const m = stamp.slice(4, 6);
  const d = stamp.slice(6, 8);
  return Date.parse(`${y}-${m}-${d}T00:00:00+08:00`);
}

/**
 * 保留期筛选:返回应删除的对象键。
 * cutoff = 北京零点(今天) − retentionDays 天;retentionDays=0 即「只留当日」。
 */
export function expiredBackupKeys(
  keys: string[],
  retentionDays: number,
  now: Date = new Date(),
): string[] {
  const cutoff = stampToInstant(backupStamp(now)) - retentionDays * 86400_000;
  return keys.filter((key) => {
    const parsed = parseBackupObjectKey(key);
    if (!parsed) return false;
    return stampToInstant(parsed.stamp) < cutoff;
  });
}

export function emptyManifest(): BackupManifest {
  return { version: 1, updatedAt: "", entries: [] };
}

/**
 * 清单合并:同 (target, 日期戳) 的旧条目被覆盖(重跑不堆积),
 * 其余按完成时刻倒序(最新在前)。
 */
export function mergeManifestEntry(
  manifest: BackupManifest,
  entry: BackupManifestEntry,
): BackupManifest {
  const entries = manifest.entries.filter(
    (e) => !(e.target === entry.target && e.key === entry.key),
  );
  entries.push(entry);
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { version: 1, updatedAt: entry.createdAt, entries };
}

/** 取某目标的最新一条清单条目 */
export function latestManifestEntry(
  manifest: BackupManifest,
  target: BackupTarget,
): BackupManifestEntry | null {
  return manifest.entries.find((e) => e.target === target) ?? null;
}

/** 扫描 dump 文本里的 CREATE TABLE 表名(流式分块,跨块不漏匹配) */
export class CreateTableScanner {
  private carry = "";
  private readonly names = new Set<string>();

  push(chunk: string): void {
    const text = this.carry + chunk;
    const re = /CREATE TABLE `([^`]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) this.names.add(m[1]);
    }
    // 保留尾部可能不成句的片段,避免匹配被块边界切断
    this.carry = text.slice(Math.max(0, text.length - 200));
  }

  list(): string[] {
    return [...this.names];
  }
}

export type BackupJudgementInput = {
  /** 压缩包字节数 */
  bytes: number;
  /** 解压后字节数 */
  rawBytes: number;
  /** 体积下限 */
  minBytes: number;
  /** dump 内的表名 */
  dumpTables: string[];
  /** 源库基础表名 */
  sourceTables: string[];
  /** COS headObject 返回的字节数(null = 校验不可用,跳过该项) */
  cosSize: number | null;
  /** dump 尾部是否见到 mysqldump 完成标记(-- Dump completed on) */
  footerOk: boolean;
};

export type BackupJudgement = { ok: boolean; reasons: string[] };

/** 校验判据(纯函数):任一不满足即判失败,reasons 给出可读原因 */
export function judgeBackup(input: BackupJudgementInput): BackupJudgement {
  const reasons: string[] = [];
  if (input.bytes < input.minBytes) {
    reasons.push(`压缩包体积 ${input.bytes}B 低于下限 ${input.minBytes}B`);
  }
  if (input.rawBytes <= 0) {
    reasons.push("解压后内容为空(gzip 损坏或 dump 为空)");
  }
  if (!input.footerOk) {
    reasons.push("dump 尾部未见 mysqldump 完成标记(-- Dump completed on)");
  }
  const dumped = new Set(input.dumpTables);
  const missing = input.sourceTables.filter((t) => !dumped.has(t));
  if (missing.length > 0) {
    const shown = missing.slice(0, 5).join("、");
    reasons.push(
      `dump 缺少源库 ${missing.length} 张表${missing.length > 5 ? "(含更多)" : ""}:${shown}`,
    );
  }
  if (input.cosSize !== null && input.cosSize !== input.bytes) {
    reasons.push(`COS 对象大小 ${input.cosSize}B 与本地 ${input.bytes}B 不一致`);
  }
  return { ok: reasons.length === 0, reasons };
}

export type BackupFailureCardInput = {
  target: BackupTarget;
  /** 失败原因列表(校验判据给出) */
  reasons: string[];
  /** 补充信息(如容器名、阶段) */
  detail?: string;
  /** 失败时刻(默认现在) */
  at?: Date;
};

/** 备份失败告警卡片(红) */
export function buildBackupFailureCard(input: BackupFailureCardInput): FeishuCard {
  const label = BACKUP_TARGET_META[input.target].label;
  const reasons = input.reasons.length > 0 ? input.reasons.join(";") : "(未记录原因)";
  return {
    title: "备份失败",
    template: "red",
    fields: [
      { label: "备份对象", value: `${label}(${input.target})` },
      { label: "时间", value: formatDateTime(input.at ?? new Date()) },
    ],
    body: `**失败原因**\n${reasons}${input.detail ? `\n\n**补充**\n${input.detail}` : ""}`,
    note: "老克塔运营告警 · 请人工排查并重跑备份",
  };
}

export type BackupSuccessCardInput = {
  target: BackupTarget;
  /** COS 对象键 */
  key: string;
  /** 压缩包字节数 */
  bytes: number;
  /** 解压后字节数 */
  rawBytes: number;
  /** dump 覆盖的表数 */
  tables: number;
  /** 备份完成时刻(默认现在) */
  at?: Date;
};

/** 备份成功卡片(绿):兼作「每日心跳」,人可据此确认备份确实在跑 */
export function buildBackupSuccessCard(input: BackupSuccessCardInput): FeishuCard {
  const label = BACKUP_TARGET_META[input.target].label;
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return {
    title: "备份完成",
    template: "green",
    fields: [
      { label: "备份对象", value: `${label}(${input.target})` },
      { label: "完成时间", value: formatDateTime(input.at ?? new Date()) },
      { label: "压缩包", value: mb(input.bytes) },
      { label: "解压后", value: mb(input.rawBytes) },
      { label: "表数", value: String(input.tables) },
    ],
    body: `**对象键**\n\`${input.key}\``,
    note: "老克塔运营告警 · 备份机制自检",
  };
}

export type BackupHeartbeatCardInput = {
  /** 最近一次业务库备份(无则 null) */
  last: BackupManifestEntry | null;
  /** 距今小时数(无备份时为 null) */
  ageHours: number | null;
  /** 阈值小时数 */
  maxAgeHours?: number;
  at?: Date;
};

/** 心跳缺失告警卡片(橙):备份未按时完成 */
export function buildBackupHeartbeatCard(input: BackupHeartbeatCardInput): FeishuCard {
  const maxAge = input.maxAgeHours ?? BACKUP_HEARTBEAT_MAX_AGE_HOURS;
  const last = input.last;
  return {
    title: "备份心跳缺失",
    template: "orange",
    fields: [
      {
        label: "最近一次备份",
        value: last ? `${formatDateTime(new Date(last.createdAt))}` : "(无记录)",
      },
      {
        label: "距今",
        value: input.ageHours === null ? "-" : `${input.ageHours.toFixed(1)} 小时(阈值 ${maxAge})`,
      },
      { label: "检查时间", value: formatDateTime(input.at ?? new Date()) },
    ],
    body: `**结论**\n业务库备份未在预期窗口内完成,请检查宿主 crontab 与备份日志。`,
    note: "老克塔运营告警 · 备份机制自检",
  };
}
