/** 服务器状态域常量(M3 US6):system_config 键/探针字段(R7/contracts/server-status.md) */

/** 人工配置 3 项中的展示开关与维护模式(p15 字段二分;当前阶段键独立导出) */
export const STATUS_CONFIG_KEYS = {
  enabled: "status.enabled",
  maintenanceMode: "status.maintenance_mode",
} as const;

/** 当前渐进阶段人工指针(R8;值=progression_node.id 字符串) */
export const PROGRESSION_CURRENT_NODE_KEY = "progression.current_node_id";

/** 探针缓存与峰值 Redis 键(非账务数据,可丢失) */
export const STATUS_REDIS_KEYS = {
  probe: "status:probe",
  probeLastok: "status:probe:lastok",
  probeTtlSeconds: 25,
  // 单飞锁:缓存未命中时只放一个探针出去,其余请求等它把快照写进缓存
  probeLock: "status:probe:lock",
  probeLockTtlSeconds: 5,
  peakPrefix: "status:peak:",
  peakTtlSeconds: 48 * 60 * 60,
  portrait: "m3:portrait",
  portraitTtlSeconds: 60,
} as const;

/** 未抢到单飞锁时的等待上限(毫秒):持锁者通常 1s 内写完缓存 */
export const STATUS_PROBE_WAIT_MS = 2_500;

/** 等待单飞锁期间的轮询间隔(毫秒) */
export const STATUS_PROBE_WAIT_INTERVAL_MS = 100;

/** SOAP 探针超时(2s,contracts/server-status.md 行为约定) */
export const STATUS_PROBE_TIMEOUT_MS = 2_000;

/** 前台状态卡轮询间隔(FR-221 30s 刷新) */
export const STATUS_POLL_INTERVAL_MS = 30_000;
