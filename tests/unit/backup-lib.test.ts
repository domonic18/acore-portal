import { describe, expect, test } from "vitest";
import {
  CreateTableScanner,
  backupObjectKey,
  backupStamp,
  buildBackupFailureCard,
  buildBackupHeartbeatCard,
  buildBackupSuccessCard,
  emptyManifest,
  expiredBackupKeys,
  judgeBackup,
  latestManifestEntry,
  mergeManifestEntry,
  parseBackupObjectKey,
  type BackupManifestEntry,
} from "../../scripts/cron/backup-lib";
import { BACKUP_COS_PREFIX, BACKUP_EXCLUDE_TABLES, BACKUP_TARGET, BACKUP_TARGET_META } from "@/constants/backup";

/**
 * 备份机制纯函数单测:对象命名 / 保留期筛选 / 清单合并 / 校验判据 / 告警卡片。
 * 判据是「什么算一次有效备份」的唯一真相源,必须锁住。
 */

const OK_INPUT = {
  bytes: 1024 * 1024,
  rawBytes: 13 * 1024 * 1024,
  minBytes: 256 * 1024,
  dumpTables: ["user", "shop_order", "order_item"],
  sourceTables: ["user", "shop_order", "order_item"],
  cosSize: 1024 * 1024,
  footerOk: true,
};

function entry(over: Partial<BackupManifestEntry> = {}): BackupManifestEntry {
  return {
    target: BACKUP_TARGET.business,
    schema: "acore_portal",
    key: backupObjectKey(BACKUP_TARGET.business, "20261115"),
    bytes: 1024,
    rawBytes: 2048,
    sha256: "a".repeat(64),
    tables: ["user"],
    anchors: { user: 6330 },
    createdAt: "2026-11-15T03:30:00.000Z",
    ...over,
  };
}

describe("备份对象键", () => {
  test("键含前缀/目标/日期戳,可解析回目标与日期", () => {
    const key = backupObjectKey(BACKUP_TARGET.business, "20261115");
    expect(key).toBe(`${BACKUP_COS_PREFIX}lokta-business-20261115.sql.gz`);
    expect(parseBackupObjectKey(key)).toEqual({
      target: BACKUP_TARGET.business,
      stamp: "20261115",
    });
  });

  test("非备份对象键/未知目标返回 null(保留期清理不得误删)", () => {
    expect(parseBackupObjectKey("backups/manifest.json")).toBeNull();
    expect(parseBackupObjectKey(`${BACKUP_COS_PREFIX}lokta-unknown-20261115.sql.gz`)).toBeNull();
    expect(parseBackupObjectKey(`${BACKUP_COS_PREFIX}lokta-business-2026111.sql.gz`)).toBeNull();
  });

  test("日期戳取北京自然日(不随运行时区漂移)", () => {
    // UTC 2026-11-14T17:00 = 北京 2026-11-15 01:00
    expect(backupStamp(new Date("2026-11-14T17:00:00.000Z"))).toBe("20261115");
  });
});

describe("保留期筛选", () => {
  const now = new Date("2026-11-15T00:00:00.000Z");

  test("retentionDays=0 只留当日;早于当日的对象键进删除名单", () => {
    const keys = [
      backupObjectKey(BACKUP_TARGET.business, "20261115"),
      backupObjectKey(BACKUP_TARGET.business, "20261114"),
    ];
    expect(expiredBackupKeys(keys, 0, now)).toEqual([
      backupObjectKey(BACKUP_TARGET.business, "20261114"),
    ]);
  });

  test("retentionDays=30 保留一个月内的对象;非备份键不动", () => {
    const keys = [
      backupObjectKey(BACKUP_TARGET.business, "20261115"),
      backupObjectKey(BACKUP_TARGET.wpLegacy, "20261001"),
      "backups/db/keep-me.txt",
    ];
    expect(expiredBackupKeys(keys, 30, now)).toEqual([
      backupObjectKey(BACKUP_TARGET.wpLegacy, "20261001"),
    ]);
  });

  test("限定目标时只清该目标(日备的清理线不扫存量库归档)", () => {
    const keys = [
      backupObjectKey(BACKUP_TARGET.business, "20261001"),
      backupObjectKey(BACKUP_TARGET.wpLegacy, "20261001"),
    ];
    expect(expiredBackupKeys(keys, 30, now, BACKUP_TARGET.business)).toEqual([
      backupObjectKey(BACKUP_TARGET.business, "20261001"),
    ]);
    expect(expiredBackupKeys(keys, 30, now, BACKUP_TARGET.wpLegacy)).toEqual([
      backupObjectKey(BACKUP_TARGET.wpLegacy, "20261001"),
    ]);
  });

  test("存量库冻结归档:标记为永久保留,不参与清理", () => {
    expect(BACKUP_TARGET_META[BACKUP_TARGET.wpLegacy].keepForever).toBe(true);
    expect(BACKUP_TARGET_META[BACKUP_TARGET.business].keepForever).toBeUndefined();
  });
});

describe("排除表(存量库的 WP 统计表不进备份)", () => {
  test("排除清单与源库口径同源:排除表不算「dump 缺表」", () => {
    const excluded = BACKUP_EXCLUDE_TABLES[BACKUP_TARGET.wpLegacy];
    expect(excluded).toContain("wp_statistics_visitor");
    expect(excluded).toContain("wp_statistics_visitor_relationships");
    expect(excluded).toContain("wp_statistics_pages");

    // 判据输入里的源表集合已剔除排除表 ⇒ dump 里没有它们也不算缺表
    const sourceTables = ["wp_users", "wp_posts", ...excluded].filter(
      (t) => !excluded.includes(t),
    );
    const r = judgeBackup({
      ...OK_INPUT,
      dumpTables: sourceTables,
      sourceTables,
    });
    expect(r.ok).toBe(true);
  });

  test("业务库不排除任何表", () => {
    expect(BACKUP_EXCLUDE_TABLES[BACKUP_TARGET.business]).toEqual([]);
  });
});

describe("清单合并", () => {
  test("同目标同键重跑覆盖(不堆积);最新在前", () => {
    const first = entry();
    const merged = mergeManifestEntry(emptyManifest(), first);
    expect(merged.entries).toHaveLength(1);

    const rerun = mergeManifestEntry(merged, entry({ bytes: 2048 }));
    expect(rerun.entries).toHaveLength(1);
    expect(rerun.entries[0]?.bytes).toBe(2048);
  });

  test("不同目标并存;latestManifestEntry 取该目标最新一条", () => {
    const manifest = mergeManifestEntry(
      mergeManifestEntry(
        emptyManifest(),
        entry({ createdAt: "2026-11-15T03:30:00.000Z" }),
      ),
      entry({
        target: BACKUP_TARGET.wpLegacy,
        key: backupObjectKey(BACKUP_TARGET.wpLegacy, "20261115"),
        createdAt: "2026-11-15T04:00:00.000Z",
      }),
    );
    expect(manifest.entries).toHaveLength(2);
    expect(latestManifestEntry(manifest, BACKUP_TARGET.business)?.key).toContain("business");
    expect(latestManifestEntry(manifest, BACKUP_TARGET.wpLegacy)?.key).toContain("wp-legacy");
  });
});

describe("校验判据(什么算一次有效备份)", () => {
  test("五项全过 = 成功", () => {
    expect(judgeBackup(OK_INPUT)).toEqual({ ok: true, reasons: [] });
  });

  test("体积低于下限 = 失败(空壳备份)", () => {
    const r = judgeBackup({ ...OK_INPUT, bytes: 10, cosSize: 10 });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("低于下限");
  });

  test("解压后为空 = 失败(gzip 损坏或 dump 为空)", () => {
    const r = judgeBackup({ ...OK_INPUT, rawBytes: 0 });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("解压后内容为空");
  });

  test("dump 缺源库表 = 失败(列出缺失表名)", () => {
    const r = judgeBackup({
      ...OK_INPUT,
      dumpTables: ["user"],
      sourceTables: ["user", "shop_order"],
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("shop_order");
  });

  test("COS 对象大小与本地不一致 = 失败", () => {
    const r = judgeBackup({ ...OK_INPUT, cosSize: 999 });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("COS 对象大小");
  });

  test("缺 mysqldump 完成标记 = 失败(dump 被截断)", () => {
    const r = judgeBackup({ ...OK_INPUT, footerOk: false });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain("Dump completed");
  });

  test("cosSize 为 null 时跳过该项(校验不可用不误判失败)", () => {
    expect(judgeBackup({ ...OK_INPUT, cosSize: null }).ok).toBe(true);
  });
});

describe("CREATE TABLE 扫描(流式分块不漏匹配)", () => {
  test("单块内多表全部捕获", () => {
    const s = new CreateTableScanner();
    s.push("CREATE TABLE `user` (\n  id int\n);\nCREATE TABLE `order_item` (\n  id int\n);\n");
    expect(s.list().sort()).toEqual(["order_item", "user"]);
  });

  test("表名被块边界切开也能捕获", () => {
    const s = new CreateTableScanner();
    s.push("CREATE TABLE `use");
    s.push("r` (\n  id int\n);\n");
    expect(s.list()).toEqual(["user"]);
  });

  test("重复表名去重", () => {
    const s = new CreateTableScanner();
    s.push("CREATE TABLE `user` (\n);\n");
    s.push("CREATE TABLE `user` (\n);\n");
    expect(s.list()).toEqual(["user"]);
  });
});

describe("告警卡片", () => {
  test("失败卡带目标与原因", () => {
    const card = buildBackupFailureCard({
      target: BACKUP_TARGET.business,
      reasons: ["压缩包体积 10B 低于下限"],
    });
    expect(card.title).toBe("备份失败");
    expect(card.template).toBe("red");
    expect(card.body).toContain("低于下限");
    expect(JSON.stringify(card.fields)).toContain("业务库");
  });

  test("心跳卡在无备份记录时给出可读结论", () => {
    const card = buildBackupHeartbeatCard({ last: null, ageHours: null });
    expect(card.title).toBe("备份心跳缺失");
    expect(JSON.stringify(card.fields)).toContain("无记录");
  });

  test("成功卡带对象键与体积(兼作每日心跳)", () => {
    const card = buildBackupSuccessCard({
      target: BACKUP_TARGET.wpLegacy,
      key: "backups/db/lokta-wp-legacy-20261115.sql.gz",
      bytes: 1024,
      rawBytes: 2048,
      tables: 112,
    });
    expect(card.template).toBe("green");
    expect(card.body).toContain("lokta-wp-legacy-20261115");
  });
});
