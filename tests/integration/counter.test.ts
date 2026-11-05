import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import { clearKeys } from "@/lib/redis/rate-limit";
import { maxCounter } from "@/lib/redis/counters";

/** issue #77:今日峰值 GET/比较/SET 非原子→Lua 原子 max(并发探针不丢更新) */
const RUN = Date.now().toString(36);
const KEY = `test:max:${RUN}`;
const TTL_KEY = `test:max:ttl:${RUN}`;

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  await clearKeys([KEY, TTL_KEY]);
  await redis.quit();
});

describe("maxCounter 原子取大值(issue #77)", () => {
  it("并发写不同值:最终为最大值,不丢更新", async () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    await Promise.all(values.map((v) => maxCounter(KEY, v, 3600)));
    expect(Number(await redis.get(KEY))).toBe(20);
  });

  it("低值不覆盖高值;返回当前最大值", async () => {
    expect(await maxCounter(KEY, 5, 3600)).toBe(20);
    expect(Number(await redis.get(KEY))).toBe(20);
    expect(await maxCounter(KEY, 99, 3600)).toBe(99);
    expect(Number(await redis.get(KEY))).toBe(99);
  });

  it("TTL 随写入设置", async () => {
    await maxCounter(TTL_KEY, 1, 600);
    const ttl = await redis.ttl(TTL_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(600);
  });
});
