import { describe, expect, it } from "vitest";
import {
  PORTRAIT_DEFAULT,
  portraitPath,
  RACE_CLASSES,
} from "@/constants/portraits";
import { getRandomPortraitUrl } from "@/server/services/shared/portrait";

/**
 * T017 US1 随机头图(quickstart S1):组合映射正确/非法组合降级默认图/
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

describe("portraitPath 组合映射(T017)", () => {
  it("合法 race/class/gender → /portraits/{r}-{c}-{g}.svg", () => {
    expect(portraitPath(1, 2, 0)).toBe("/portraits/1-2-0.svg");
    expect(portraitPath(6, 11, 1)).toBe("/portraits/6-11-1.svg");
  });

  it("非法组合(60 时代不存在的职业/性别)返回 null", () => {
    expect(portraitPath(1, 11, 0)).toBeNull(); // 人类无德鲁伊
    expect(portraitPath(1, 1, 2)).toBeNull(); // 性别枚举仅 0/1
    expect(portraitPath(99, 1, 0)).toBeNull(); // 未知种族
    expect(portraitPath(1, 6, 0)).toBeNull(); // 职业枚举无 6
  });

  it("全组合枚举均能映射(素材集契约)", () => {
    for (const [race, classes] of Object.entries(RACE_CLASSES)) {
      for (const klass of classes) {
        for (const gender of [0, 1]) {
          expect(portraitPath(Number(race), klass, gender)).toBe(
            `/portraits/${race}-${klass}-${gender}.svg`,
          );
        }
      }
    }
  });
});

describe("getRandomPortraitUrl(T017)", () => {
  it("抽样成功映射头像路径并写 60s 缓存", async () => {
    const cache = fakeCache();
    const url = await getRandomPortraitUrl({
      query: async () => ({ race: 3, class: 2, gender: 1 }),
      cache,
    });
    expect(url).toBe("/portraits/3-2-1.svg");
    expect(cache.store.get("m3:portrait")).toBe("/portraits/3-2-1.svg");
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
    cache.store.set("m3:portrait", "/portraits/8-3-0.svg");
    let queried = 0;
    const url = await getRandomPortraitUrl({
      query: async () => {
        queried += 1;
        return { race: 1, class: 1, gender: 0 };
      },
      cache,
    });
    expect(url).toBe("/portraits/8-3-0.svg");
    expect(queried).toBe(0);
  });

  it("非法三元组(库数据畸形)降级默认图", async () => {
    const url = await getRandomPortraitUrl({
      query: async () => ({ race: 1, class: 11, gender: 0 }),
      cache: fakeCache(),
    });
    expect(url).toBe(PORTRAIT_DEFAULT);
  });
});
