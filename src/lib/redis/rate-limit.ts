import "server-only";
import { redis } from "./index";

export type RateResult = { allowed: boolean; count: number; retryAfterSec?: number };

/**
 * 固定窗口计数限速(INCR + EXPIRE NX,redis 通用封装)
 * key 需自带业务前缀,如 rl:mail:resend:{userId}:{date}
 */
export async function hitRateLimit(
  key: string,
  opts: { windowSec: number; max: number },
): Promise<RateResult> {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, opts.windowSec);
  }
  const ttl = await redis.ttl(key);
  return {
    allowed: count <= opts.max,
    count,
    retryAfterSec: ttl > 0 ? ttl : undefined,
  };
}

export type LockState = { locked: boolean; retryAfterSec: number };

/**
 * 显式锁(M4 登录防滥用:达阈值即锁,区别于自然过期的固定窗口计数)。
 * 键需自带业务前缀,如 login:lock:u:{username}
 */
export async function setLock(key: string, ttlSec: number): Promise<void> {
  await redis.set(key, "1", "EX", ttlSec);
}

export async function checkLock(key: string): Promise<LockState> {
  const ttl = await redis.ttl(key);
  return { locked: ttl > 0, retryAfterSec: ttl > 0 ? ttl : 0 };
}

/** 批量清除(登录成功清失败计数;测试清理) */
export async function clearKeys(keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
