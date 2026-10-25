import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import { checkLock, clearKeys, setLock } from "@/lib/redis/rate-limit";

/** T005:显式锁助手(真实 Redis;键带 RUN 段防撞) */
const RUN = Date.now().toString(36);
const KEY = `test:lock:${RUN}`;
const KEY_A = `test:ck:${RUN}:a`;
const KEY_B = `test:ck:${RUN}:b`;
const KEYS_A = [KEY_A, KEY_B];

beforeAll(async () => {
  await redis.ping();
});

afterAll(async () => {
  await clearKeys([KEY, KEY_A, KEY_B]);
  await redis.quit();
});

describe("锁助手 setLock/checkLock/clearKeys(T005)", () => {
  it("未设锁=不锁;setLock 后锁内拒绝且带 retryAfterSec", async () => {
    await expect(checkLock(KEY)).resolves.toEqual({
      locked: false,
      retryAfterSec: 0,
    });

    await setLock(KEY, 60);
    const state = await checkLock(KEY);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSec).toBeGreaterThan(0);
    expect(state.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("TTL 到期自动恢复(2s 短锁)", async () => {
    const key = `test:lock:ttl:${RUN}`;
    await setLock(key, 1);
    expect((await checkLock(key)).locked).toBe(true);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await checkLock(key)).toEqual({ locked: false, retryAfterSec: 0 });
  });

  it("clearKeys 批量清除生效", async () => {
    await setLock(KEY_A, 60);
    await setLock(KEY_B, 60);
    await clearKeys(KEYS_A);
    expect((await checkLock(KEY_A)).locked).toBe(false);
    expect((await checkLock(KEY_B)).locked).toBe(false);
  });

  it("setLock 重设刷新 TTL(再锁续期)", async () => {
    await setLock(KEY, 60);
    const first = await checkLock(KEY);
    await new Promise((r) => setTimeout(r, 1100));
    await setLock(KEY, 60);
    const second = await checkLock(KEY);
    expect(second.retryAfterSec).toBeGreaterThanOrEqual(first.retryAfterSec - 2);
  });
});
