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
