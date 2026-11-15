/**
 * 备份机制常量(cron 备份 / 心跳检查 / 恢复演练三处共用):
 * 目标标识 → COS 对象命名、源 schema、体积下限;行数锚点表。
 *
 * 口径:游戏四库不在此列——游戏库由 acore-deploy 侧每日备份,
 * 门户侧备份只覆盖「站点自己的数据」(业务库 + WP 存量存档库)。
 */

/** COS 备份对象前缀 */
export const BACKUP_COS_PREFIX = "backups/db/";

/** 备份清单对象键(COS 内单文件,记录每次备份的元信息与校验结果) */
export const BACKUP_MANIFEST_KEY = "backups/manifest.json";

export const BACKUP_TARGET = {
  /** 门户业务库(schema 取 DATABASE_URL 指向的库) */
  business: "business",
  /** WP 存量存档库(迁移留档,只读,周备) */
  wpLegacy: "wp-legacy",
} as const;

export type BackupTarget = (typeof BACKUP_TARGET)[keyof typeof BACKUP_TARGET];

export type BackupTargetMeta = {
  /** 源 schema 名;null = 取 DATABASE_URL 指向的库 */
  schema: string | null;
  /** 中文标签(告警卡片与清单展示) */
  label: string;
  /** 压缩包体积下限(字节):低于此值判为「空壳备份」 */
  minBytes: number;
};

export const BACKUP_TARGET_META: Record<BackupTarget, BackupTargetMeta> = {
  business: { schema: null, label: "业务库", minBytes: 256 * 1024 },
  "wp-legacy": { schema: "wp_legacy", label: "存量存档库", minBytes: 1024 * 1024 },
};

/**
 * 恢复演练的行数锚点表(清单记录备份当时的行数,演练时逐表核对):
 * 库内缺表则跳过,不阻断(表名随业务演进而变,锚点只保证「核心账面」可比)。
 */
export const BACKUP_ANCHOR_TABLES: Record<BackupTarget, readonly string[]> = {
  business: [
    "user",
    "shop_order",
    "order_item",
    "product",
    "article",
    "media_asset",
    "point_transaction",
  ],
  "wp-legacy": ["wp_users", "wp_posts", "wp_options", "wp_postmeta", "wp_usermeta"],
};

/** 心跳阈值(小时):超过即判「备份未按时完成」并告警 */
export const BACKUP_HEARTBEAT_MAX_AGE_HOURS = 26;
