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
 * 批量固定窗口配额(issue #76):原子检查余量并按 n 扣减,不足整批拒绝
 * (不部分消费);Lua 保证「读余量-比较-扣减」单原子操作,并发批量无法超扣。
 */
export async function reserveQuota(
  key: string,
  opts: { windowSec: number; max: number; n: number },
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const n = Math.max(1, Math.floor(opts.n));
  const lua = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current + tonumber(ARGV[1]) > tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl <= 0 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
    ttl = tonumber(ARGV[3])
  end
  return {0, ttl}
end
redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3], 'NX')
return {1, redis.call('TTL', KEYS[1])}
`;
  const result = (await redis.eval(lua, 1, key, String(n), String(opts.max), String(opts.windowSec))) as [
    number,
    number,
  ];
  return { allowed: result[0] === 1, retryAfterSec: result[1] > 0 ? result[1] : undefined };
}

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
