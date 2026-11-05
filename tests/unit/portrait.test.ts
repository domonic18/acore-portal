import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTRAIT_DEFAULT, raceFacePath } from "@/constants/portraits";
import { getRandomPortraitUrl } from "@/server/services/shared/portrait";

/**
 * T017 US1 随机头图(quickstart S1):官方种族头像映射正确/非法取值降级默认图/
 * 抽样异常与超时降级/Redis 缓存 60s 命中不发查询。
 */

function fakeCache() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: string, _mode: "EX", _ttl: number) => {
      store.set(k, v);
    },
  };
}

describe("raceFacePath 官方头像映射(T017,2026-11-05 与我的角色页统一)", () => {
  it("合法 race/gender → /assets/icons/race/ 官方图(按性别)", () => {
    expect(raceFacePath(1, 0)).toBe(
      "/assets/icons/race/Ui-charactercreate-races_human-male.png",
    );
    expect(raceFacePath(3, 1)).toBe(
      "/assets/icons/race/Ui-charactercreate-races_dwarf-female.png",
    );
    expect(raceFacePath(10, 0)).toBe(
      "/assets/icons/race/Ui-charactercreate-races_bloodelf-male.png",
    );
  });

  it("非法取值(未知种族/性别枚举仅 0/1)返回 null", () => {
    expect(raceFacePath(99, 0)).toBeNull();
    expect(raceFacePath(1, 2)).toBeNull();
  });

  it("素材集契约:全种族×性别映射文件真实存在(移植自 acore-ranking)", () => {
    for (const race of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      for (const gender of [0, 1]) {
        const path = raceFacePath(race, gender);
        expect(path, `race=${race} gender=${gender}`).toBeTruthy();
        expect(existsSync(join(process.cwd(), "public", path!))).toBe(true);
      }
    }
  });
});

describe("getRandomPortraitUrl(T017)", () => {
  it("抽样成功映射官方头像路径并写 60s 缓存", async () => {
    const cache = fakeCache();
    const url = await getRandomPortraitUrl({
      query: async () => ({ race: 3, gender: 1 }),
      cache,
    });
    const expected = "/assets/icons/race/Ui-charactercreate-races_dwarf-female.png";
    expect(url).toBe(expected);
    expect(cache.store.get("m3:portrait")).toBe(expected);
  });

  it("抽样抛错降级默认图且不抛出(FR-203)", async () => {
    const url = await getRandomPortraitUrl({
      query: async () => {
        throw new Error("db down");
      },
      cache: fakeCache(),
    });
    expect(url).toBe(PORTRAIT_DEFAULT);
  });

  it("空结果(无角色)降级默认图", async () => {
    const url = await getRandomPortraitUrl({
      query: async () => null,
      cache: fakeCache(),
    });
    expect(url).toBe(PORTRAIT_DEFAULT);
  });

  it("抽样超时 500ms 降级默认图", async () => {
    const url = await getRandomPortraitUrl({
      query: () => new Promise(() => undefined), // 永不 resolve
      cache: fakeCache(),
    });
    expect(url).toBe(PORTRAIT_DEFAULT);
  });

  it("缓存命中不发查询", async () => {
    const cache = fakeCache();
    const cached = "/assets/icons/race/Ui-charactercreate-races_orc-male.png";
    cache.store.set("m3:portrait", cached);
    let queried = 0;
    const url = await getRandomPortraitUrl({
      query: async () => {
        queried += 1;
        return { race: 1, gender: 0 };
      },
      cache,
    });
    expect(url).toBe(cached);
    expect(queried).toBe(0);
  });

  it("非法取值(库数据畸形)降级默认图", async () => {
    const url = await getRandomPortraitUrl({
      query: async () => ({ race: 99, gender: 0 }),
      cache: fakeCache(),
    });
    expect(url).toBe(PORTRAIT_DEFAULT);
  });
});
