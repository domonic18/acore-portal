import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { redis } from "@/lib/redis";
import {
  RateLimitUnavailableError,
  checkLock,
  clearKeys,
  hitRateLimit,
  reserveQuota,
  setLock,
  setLockIfAbsent,
} from "@/lib/redis/rate-limit";

/**
 * 限流原语集成(2026-11-06 撞库加固 PR-B):
 * hitRateLimit 原子性(单条 Lua 兼含 INCR+EXPIRE,计数键必带 TTL——
 * 旧实现两条命令,进程死在中间会留下无 TTL 的计数键 → 该用户/IP 被永久锁死);
 * failOpen 语义(默认放行+degraded 标记;failOpen:false 时故障抛
 * RateLimitUnavailableError,由调用方回 503,绝不能「故障即放行」);
 * setLockIfAbsent 的 SET NX EX(第二调用者不获得锁、不续期);
 * reserveQuota 批量扣减语义不变。
 */
const RUN = Date.now().toString(36);
const key = (name: string) => `t:rl:${name}:${RUN}`;

const keys: string[] = [];

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  await clearKeys(keys);
  vi.restoreAllMocks();
  await redis.quit();
});

describe("限流原语——hitRateLimit 原子性与 failOpen 语义", () => {
  it("单条 Lua 完成 INCR+EXPIRE:计数递增且键必带 TTL(无 TTL 即永久锁死风险)", async () => {
    const k = key("atomic");
    keys.push(k);
    const evalSpy = vi.spyOn(redis, "eval");

    const first = await hitRateLimit(k, { windowSec: 60, max: 5 });
    expect(first.count).toBe(1);
    expect(first.allowed).toBe(true);

    // 计数与过期在同一次 eval 里完成——不得拆成两条命令
    expect(evalSpy).toHaveBeenCalledTimes(1);
    const script = String(evalSpy.mock.calls[0]?.[0] ?? "");
    expect(script).toContain("INCR");
    expect(script).toContain("EXPIRE");

    const ttl = await redis.ttl(k);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("计数累加与阈值判定:count > max 时 allowed=false,并带 retryAfterSec", async () => {
    const k = key("count");
    keys.push(k);
    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(await hitRateLimit(k, { windowSec: 60, max: 2 }));
    }
    expect(results.map((r) => r.count)).toEqual([1, 2, 3]);
    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
    expect(results[2]?.retryAfterSec).toBeGreaterThan(0);
  });

  it("failOpen 默认 true:Redis 故障时放行并标 degraded(统计类端点宁可少记不可 500)", async () => {
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    const res = await hitRateLimit(key("failopen"), { windowSec: 60, max: 5 });
    expect(res.allowed).toBe(true);
    expect(res.degraded).toBe(true);
    expect(res.count).toBe(0);
    vi.restoreAllMocks();
  });

  it("failOpen:false:Redis 故障时抛 RateLimitUnavailableError(被攻击端点必须失败关闭)", async () => {
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    await expect(
      hitRateLimit(key("failclosed"), { windowSec: 60, max: 5, failOpen: false }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
    vi.restoreAllMocks();
  });
});

describe("限流原语——显式锁", () => {
  it("setLock 写入并带 TTL;checkLock 读出剩余秒数", async () => {
    const k = key("lock");
    keys.push(k);
    await setLock(k, 30);
    const state = await checkLock(k);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSec).toBeGreaterThan(0);
    expect(state.retryAfterSec).toBeLessThanOrEqual(30);
  });

  it("setLockIfAbsent:NX 语义——首个获得锁,第二个不获得且不续期", async () => {
    const k = key("nx");
    keys.push(k);
    expect(await setLockIfAbsent(k, 30)).toBe(true);
    const ttlAfterFirst = await redis.ttl(k);
    expect(ttlAfterFirst).toBeGreaterThan(0);

    // 第二个调用者拿不到锁
    expect(await setLockIfAbsent(k, 30)).toBe(false);
    // 且不续期:TTL 只减不增
    const ttlAfterSecond = await redis.ttl(k);
    expect(ttlAfterSecond).toBeLessThanOrEqual(ttlAfterFirst);
    expect(ttlAfterSecond).toBeGreaterThan(0);
  });
});

describe("限流原语——reserveQuota 批量扣减", () => {
  it("余量不足时整批拒绝(不部分消费);充足时整批扣减", async () => {
    const k = key("quota");
    keys.push(k);

    const ok = await reserveQuota(k, { windowSec: 60, max: 10, n: 4 });
    expect(ok.allowed).toBe(true);

    const partial = await reserveQuota(k, { windowSec: 60, max: 10, n: 7 });
    expect(partial.allowed).toBe(false);
    // 拒绝后计数未被扣(键存的是已消耗量,仍为 4)
    expect(Number(await redis.get(k))).toBe(4);

    const again = await reserveQuota(k, { windowSec: 60, max: 10, n: 6 });
    expect(again.allowed).toBe(true);
    expect(Number(await redis.get(k))).toBe(10);
  });
});
