import "server-only";
import { redis } from "./index";

export type RateResult = {
  allowed: boolean;
  count: number;
  retryAfterSec?: number;
  /** Redis 故障且 failOpen 生效:本次未计数,限流未生效 */
  degraded?: boolean;
};

/**
 * 限流依赖不可用(Redis 故障)。
 * 被保护端点据此回 503(失败关闭)而不是 500,也不是「限流被静默绕过」。
 */
export class RateLimitUnavailableError extends Error {
  constructor(message = "限流服务不可用", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RateLimitUnavailableError";
  }
}

/** 包一层:把 Redis 调用故障统一转成 RateLimitUnavailableError */
async function redisCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new RateLimitUnavailableError("限流服务不可用", { cause: err });
  }
}

/**
 * 固定窗口计数限速。
 *
 * INCR 与 EXPIRE 走**单条 Lua**:进程若在两条命令之间死亡,
 * 计数键会永不过期 → 该用户/IP 被永久锁死(事故 F5)。
 *
 * failOpen(默认 true):Redis 故障时放行并标 degraded——统计类端点宁可少记不可 500。
 * **被攻击面必须传 failOpen:false**:故障时抛 RateLimitUnavailableError,由调用方回 503。
 */
export async function hitRateLimit(
  key: string,
  opts: { windowSec: number; max: number; failOpen?: boolean },
): Promise<RateResult> {
  const failOpen = opts.failOpen ?? true;
  const lua = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;
  try {
    const result = (await redis.eval(lua, 1, key, String(opts.windowSec))) as [number, number];
    const count = result[0];
    const ttl = result[1];
    return {
      allowed: count <= opts.max,
      count,
      retryAfterSec: ttl > 0 ? ttl : undefined,
    };
  } catch (err) {
    if (!failOpen) {
      throw new RateLimitUnavailableError("限流服务不可用", { cause: err });
    }
    return { allowed: true, count: 0, degraded: true };
  }
}

/**
 * 读当前计数(不增长):用于「预算前瞻」——
 * 先看额度是否已用尽,再决定排队还是拒绝;真正的计数自增由 hitRateLimit 承担。
 * 计数键不存在视为 0(窗口未开或已过期)。
 */
export async function readRateLimit(key: string): Promise<{ count: number; retryAfterSec: number }> {
  const [raw, ttl] = await redisCall(() => Promise.all([redis.get(key), redis.ttl(key)]));
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return {
    count: Number.isFinite(parsed) ? parsed : 0,
    retryAfterSec: ttl > 0 ? ttl : 0,
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
  const result = (await redisCall(() =>
    redis.eval(
      lua,
      1,
      key,
      String(n),
      String(opts.max),
      String(opts.windowSec),
    ),
  )) as [number, number];
  return { allowed: result[0] === 1, retryAfterSec: result[1] > 0 ? result[1] : undefined };
}

/**
 * 显式锁(M4 登录防滥用:达阈值即锁,区别于自然过期的固定窗口计数)。
 * 键需自带业务前缀,如 login:lock:u:{username}
 */
export async function setLock(key: string, ttlSec: number): Promise<void> {
  await redisCall(() => redis.set(key, "1", "EX", ttlSec));
}

/**
 * 条件加锁(SET NX EX):键不存在时才获得锁并设置 TTL。
 * 获得锁返回 true;已有锁返回 false 且**不续期**
 * (setLock 无 NX,重复调用是续期而非加锁,不能用于互斥场景)。
 */
export async function setLockIfAbsent(key: string, ttlSec: number): Promise<boolean> {
  const res = await redisCall(() => redis.set(key, "1", "EX", ttlSec, "NX"));
  return res === "OK";
}

export async function checkLock(key: string): Promise<LockState> {
  const ttl = await redisCall(() => redis.ttl(key));
  return { locked: ttl > 0, retryAfterSec: ttl > 0 ? ttl : 0 };
}

/** 批量清除(登录成功清失败计数;测试清理) */
export async function clearKeys(keys: string[]): Promise<void> {
  if (keys.length > 0) {
    await redisCall(() => redis.del(...keys));
  }
}
