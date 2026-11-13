import { describe, expect, it, vi } from "vitest";
import { getGameItem, searchGameItems } from "@/server/services/catalog/game-items";
import { GameDbError } from "@/server/services/shared/game-identity";

const worldState = vi.hoisted(() => ({ fail: false, localeMissing: false }));
vi.mock("@/lib/db/world", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/world")>();
  return {
    ...actual,
    getWorldDb: async () => {
      if (worldState.fail) throw new Error("world db down");
      const db = await actual.getWorldDb();
      if (!worldState.localeMissing) return db;
      // 模拟精简游戏库:没有 item_template_locale 表(Prisma 报 P2021)
      return new Proxy(db, {
        get(target, prop) {
          if (prop === "itemTemplateLocale") {
            return {
              findMany: async () => {
                const err = new Error(
                  "The table `acore_world.item_template_locale` does not exist in the current database.",
                ) as Error & { code?: string };
                err.code = "P2021";
                throw err;
              },
            };
          }
          const value = (target as unknown as Record<string, unknown>)[prop as string];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
});

/**
 * 游戏物品检索服务集成测试(2026-11-08 商品编辑台重构):
 * 数据源 world.item_template 只读子集(entry/name/quality);
 * 纯数字查询走主键精确命中,文本查询走名称包含匹配。
 * 中文名取 world.item_template_locale 的 zhCN 行(issue #151)。
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

/** 中文物品名(issue #151):item_template.name 是英文名,中文名在 item_template_locale */
describe("游戏物品检索(中文名,issue #151)", () => {
  it("中文名随命中项一并返回", async () => {
    const hits = await searchGameItems({ q: "19019" });
    expect(hits[0]?.nameZh).toBe("限量测试坐骑");
    // 英文名保留,供中英对照
    expect(hits[0]?.name).toBeTruthy();
  });

  it("按中文名检索命中对应物品", async () => {
    const hits = await searchGameItems({ q: "限量测试坐骑" });
    expect(hits.map((h) => h.entry)).toContain(19019);
    expect(hits[0]?.nameZh).toBe("限量测试坐骑");
  });

  it("中文名与英文名各自可检索(两套关键字)", async () => {
    const byZh = await searchGameItems({ q: "中文坐骑", limit: 3 });
    expect(byZh.length).toBeGreaterThan(0);
    expect(byZh.every((h) => (h.nameZh ?? "").includes("中文坐骑"))).toBe(true);

    const byEn = await searchGameItems({ q: "测试物品", limit: 3 });
    expect(byEn.every((h) => (h.name ?? "").includes("测试物品"))).toBe(true);
  });

  it("getGameItem 同样返回中文名", async () => {
    expect((await getGameItem(19020))?.nameZh).toBe("促销测试坐骑");
  });

  it("本地化表缺失 → 降级为只显示英文名,不报错", async () => {
    worldState.localeMissing = true;
    try {
      const hits = await searchGameItems({ q: "19019" });
      expect(hits[0]?.entry).toBe(19019);
      expect(hits[0]?.nameZh).toBeNull();
      // 中文检索退化为无命中(而非 503),英文检索照常
      expect(await searchGameItems({ q: "限量测试坐骑" })).toHaveLength(0);
      expect((await getGameItem(19019))?.nameZh).toBeNull();
    } finally {
      worldState.localeMissing = false;
    }
  });
});
