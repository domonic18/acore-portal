import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import { clearKeys, reserveQuota } from "@/lib/redis/rate-limit";

/** issue #76:批量配额原子检查+按张数扣减(真实 Redis;键带 RUN 段防撞) */
const RUN = Date.now().toString(36);
const KEY = `test:quota:${RUN}`;

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  await clearKeys([KEY, `test:quota:cc:${RUN}`, `test:quota:ttl:${RUN}`]);
  await redis.quit();
});

describe("reserveQuota 批量配额(issue #76)", () => {
  it("按 n 扣减:余量足整批放行;不足整批拒绝且不部分消费", async () => {
    const first = await reserveQuota(KEY, { windowSec: 3600, max: 10, n: 3 });
    expect(first.allowed).toBe(true);

    // 余量 7,要 8 → 拒绝且余量不变
    const denied = await reserveQuota(KEY, { windowSec: 3600, max: 10, n: 8 });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
    expect(Number(await redis.get(KEY))).toBe(3);

    // 余量 7,要 7 → 放行至满;再要 1 拒绝
    expect((await reserveQuota(KEY, { windowSec: 3600, max: 10, n: 7 })).allowed).toBe(true);
    expect((await reserveQuota(KEY, { windowSec: 3600, max: 10, n: 1 })).allowed).toBe(false);
  });

  it("并发批量不超扣:恰好放行 max/n 组,超限组拒绝", async () => {
    const key = `test:quota:cc:${RUN}`;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => reserveQuota(key, { windowSec: 3600, max: 10, n: 2 })),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(5); // 5×2=10 恰满
    expect(Number(await redis.get(key))).toBe(10);
  });

  it("TTL 随首次写入设置(EXPIRE NX)", async () => {
    const key = `test:quota:ttl:${RUN}`;
    await reserveQuota(key, { windowSec: 3600, max: 5, n: 1 });
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3600);
  });
});
