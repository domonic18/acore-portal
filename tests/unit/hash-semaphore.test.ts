import { describe, expect, it } from "vitest";
import { acquireHashSlot, hashSlotStats } from "@/server/services/auth/hash-semaphore";

/**
 * 哈希并发闸(2026-11-06 撞库加固 PR-C):
 * 单进程限制在飞哈希数,把突发摊成排队;槽位所有权直接交接,
 * 「先减后加」的窗口会让后来者超领,并发上限形同虚设。
 */
describe("哈希并发闸", () => {
  it("有空槽时立即获得;释放后在飞数归零", async () => {
    const res = await acquireHashSlot(2, 100);
    expect(res.ok).toBe(true);
    expect(hashSlotStats().inFlight).toBe(1);
    if (res.ok) res.slot.release();
    expect(hashSlotStats().inFlight).toBe(0);
  });

  it("超出上限时排队等待;槽位释放后直接交接给等待者(在飞数不变)", async () => {
    const first = await acquireHashSlot(1, 500);
    expect(first.ok).toBe(true);

    const pending = acquireHashSlot(1, 1000);
    await new Promise((r) => setTimeout(r, 20));
    expect(hashSlotStats().waiting).toBe(1);

    if (first.ok) first.slot.release();
    const second = await pending;
    expect(second.ok).toBe(true);
    // 交接而非新建:在飞数仍是 1
    expect(hashSlotStats().inFlight).toBe(1);
    if (second.ok) second.slot.release();
    expect(hashSlotStats().inFlight).toBe(0);
  });

  it("排队超时 → 拿不到槽(调用方回 429 SERVER_BUSY),超时者已离队", async () => {
    const first = await acquireHashSlot(1, 100);
    const res = await acquireHashSlot(1, 30);
    expect(res.ok).toBe(false);
    expect(hashSlotStats().waiting).toBe(0);
    if (first.ok) first.slot.release();
  });

  it("重复 release 幂等:在飞数不会被减成负数", async () => {
    const res = await acquireHashSlot(1, 100);
    if (res.ok) {
      res.slot.release();
      res.slot.release();
    }
    expect(hashSlotStats().inFlight).toBe(0);
  });
});
