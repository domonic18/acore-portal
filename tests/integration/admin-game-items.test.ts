import { describe, expect, it, vi } from "vitest";
import { getGameItem, searchGameItems } from "@/server/services/catalog/game-items";
import { GameDbError } from "@/server/services/shared/game-identity";

const worldState = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/db/world", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/world")>();
  return {
    ...actual,
    getWorldDb: async () => {
      if (worldState.fail) throw new Error("world db down");
      return actual.getWorldDb();
    },
  };
});

/**
 * 游戏物品检索服务集成测试(2026-11-08 商品编辑台重构):
 * 数据源 world.item_template 只读子集(entry/name/quality);
 * 纯数字查询走主键精确命中,文本查询走名称包含匹配。
 */
describe("游戏物品检索(world.item_template 只读子集)", () => {
  it("纯数字查询按 entry 精确命中", async () => {
    const hits = await searchGameItems({ q: "19019" });
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ entry: 19019 });
    expect(hits[0]?.name).toBeTruthy();
  });

  it("名称包含匹配:中文关键字可命中多个条目", async () => {
    const hits = await searchGameItems({ q: "测试物品", limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits.every((h) => (h.name ?? "").includes("测试物品"))).toBe(true);
  });

  it("limit 截断:limit=1 时只返回一条", async () => {
    const hits = await searchGameItems({ q: "测试物品", limit: 1 });
    expect(hits).toHaveLength(1);
  });

  it("limit 越界收敛到 1..50(非法值回落默认 20)", async () => {
    const tooBig = await searchGameItems({ q: "测试物品", limit: 9999 });
    expect(tooBig.length).toBeLessThanOrEqual(50);
    const tooSmall = await searchGameItems({ q: "测试物品", limit: 0 });
    expect(tooSmall.length).toBeGreaterThanOrEqual(1);
  });

  it("getGameItem:命中返回条目,未命中返回 null", async () => {
    expect((await getGameItem(19019))?.entry).toBe(19019);
    expect(await getGameItem(99999999)).toBeNull();
  });

  it("world 库不可达 → GameDbError(路由层 503,不放行)", async () => {
    worldState.fail = true;
    try {
      await expect(searchGameItems({ q: "19019" })).rejects.toBeInstanceOf(GameDbError);
      await expect(getGameItem(19019)).rejects.toBeInstanceOf(GameDbError);
    } finally {
      worldState.fail = false;
    }
  });
});
