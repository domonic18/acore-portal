import "server-only";
import { redis } from "@/lib/redis";

/**
 * 404 采集统计(FR-312/research R8):匿名上报按日 hash 累计 path→次数,
 * 后台看板读近 7 日合并 Top10。
 * 键构造与写入收口本模块(issue #74:路由与服务两处重复拼键 + 路由直写 Redis 越层);
 * TTL 必须覆盖看板查询窗口(≥7 日),否则第 3–7 天数据缺失。
 */
export const NOT_FOUND_KEY_PREFIX = "stats:404:";
/** TTL 8 日(≥7 日看板窗口 + 跨日边界冗余) */
export const NOT_FOUND_TTL_SECONDS = 8 * 24 * 3600;
/** 看板合并窗口(近 N 日) */
export const NOT_FOUND_DASHBOARD_DAYS = 7;

/** 日键:stats:404:{yyyyMMdd} */
export function notFoundDayKey(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${NOT_FOUND_KEY_PREFIX}${yyyy}${mm}${dd}`;
}

/** 记录一次 404 命中(hash 字段 +1,TTL 低于看板窗口时补齐) */
export async function recordNotFound(path: string): Promise<void> {
  const key = notFoundDayKey();
  await redis.hincrby(key, path, 1);
  const ttl = await redis.ttl(key);
  // 旧键可能残留更短 TTL(历史 48h):统一补齐到看板窗口,否则第 3–7 日数据缺失(issue #74)
  if (ttl < 0 || ttl < NOT_FOUND_TTL_SECONDS) {
    await redis.expire(key, NOT_FOUND_TTL_SECONDS);
  }
}
