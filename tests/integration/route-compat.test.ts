import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { normalizeLegacyKey } from "@/constants/legacy-routes";
import { TOOL_PAGES } from "@/constants/tools";
import {
  invalidateRouteCache,
  lookupLegacyRoute,
  removeRouteMapping,
  saveRouteMapping,
} from "@/server/services/routes/route-map";

// 高位数字键避开 dev/其他测试数据;route_map 为共享表,只动自己的键
const KEYS = ["p:990001", "page_id:990002", "cat:990003"];

async function cleanup() {
  await prisma.routeMap.deleteMany({ where: { oldKey: { in: KEYS } } });
  invalidateRouteCache();
}

afterEach(cleanup);
afterAll(cleanup);

describe("normalizeLegacyKey(FR-026 规范化)", () => {
  it("三类参数各自成键", () => {
    expect(normalizeLegacyKey("123", null, null)).toBe("p:123");
    expect(normalizeLegacyKey(null, "79", null)).toBe("page_id:79");
    expect(normalizeLegacyKey(null, null, "4")).toBe("cat:4");
  });

  it("多参数并存按 p > page_id > cat 取值", () => {
    expect(normalizeLegacyKey("1", "2", "3")).toBe("p:1");
    expect(normalizeLegacyKey(null, "2", "3")).toBe("page_id:2");
  });

  it("非纯数字/空值一律未命中,不做模糊猜测", () => {
    expect(normalizeLegacyKey("12abc", null, null)).toBeNull();
    expect(normalizeLegacyKey("", "", "")).toBeNull();
    expect(normalizeLegacyKey(null, null, null)).toBeNull();
    expect(normalizeLegacyKey("-5", null, null)).toBeNull();
  });

  it("M3 扩展:topic/forum 键与内容键优先级 p > page_id > cat > topic > forum(FR-219)", () => {
    expect(normalizeLegacyKey(null, null, null, "45", null)).toBe("topic:45");
    expect(normalizeLegacyKey(null, null, null, null, "12")).toBe("forum:12");
    expect(normalizeLegacyKey(null, null, null, "45", "12")).toBe("topic:45");
    expect(normalizeLegacyKey("1", null, null, "45", "12")).toBe("p:1");
    expect(normalizeLegacyKey(null, null, null, "4.5", null)).toBeNull();
    expect(normalizeLegacyKey(null, null, null, "abc", null)).toBeNull();
  });
});

describe("lookupLegacyRoute(FR-026 查表)", () => {
  it("键格式非法直接拒绝,不产生命中", async () => {
    await expect(lookupLegacyRoute("foo:1")).resolves.toBeNull();
    await expect(lookupLegacyRoute("p:1;drop")).resolves.toBeNull();
    await expect(lookupLegacyRoute("")).resolves.toBeNull();
  });

  it("进程内缓存生效,写时失效可见(SC-005 机制部分)", async () => {
    // 初始未命中(表空)
    await expect(lookupLegacyRoute(KEYS[0]!)).resolves.toBeNull();

    // 服务写入 → 失效重载 → 命中
    await saveRouteMapping(KEYS[0]!, "/account");
    await expect(lookupLegacyRoute(KEYS[0]!)).resolves.toBe("/account");

    // 绕过服务直改 DB(模拟外部写入):读值不变 → 证明读走的是进程内缓存
    await prisma.routeMap.update({
      where: { oldKey: KEYS[0]! },
      data: { newPath: "/changed-directly" },
    });
    await expect(lookupLegacyRoute(KEYS[0]!)).resolves.toBe("/account");

    // 显式失效后可见直改结果 → 证明失效机制生效
    invalidateRouteCache();
    await expect(lookupLegacyRoute(KEYS[0]!)).resolves.toBe("/changed-directly");

    // 服务删除 → 失效 → 未命中
    await removeRouteMapping(KEYS[0]!);
    await expect(lookupLegacyRoute(KEYS[0]!)).resolves.toBeNull();
  });

  it("enabled=false 视为未命中(上层 404)", async () => {
    await prisma.routeMap.create({
      data: { oldKey: KEYS[1]!, newPath: "/points", enabled: false },
    });
    invalidateRouteCache();
    await expect(lookupLegacyRoute(KEYS[1]!)).resolves.toBeNull();

    await prisma.routeMap.update({
      where: { oldKey: KEYS[1]! },
      data: { enabled: true },
    });
    invalidateRouteCache();
    await expect(lookupLegacyRoute(KEYS[1]!)).resolves.toBe("/points");
  });

  it("saveRouteMapping 校验键与新路径格式", async () => {
    await expect(saveRouteMapping("evil:1", "/ok")).rejects.toThrow(/键格式非法/);
    await expect(saveRouteMapping(KEYS[2]!, "https://evil.example")).rejects.toThrow(
      /以 \/ 开头/,
    );
    const rows = await prisma.routeMap.findMany({
      where: { oldKey: KEYS[2]! },
    });
    expect(rows).toHaveLength(0);
  });
});

describe("工具页六键 route_map(M4 US1 T023,契约 tools-and-seo)", () => {
  // 六真键为生产映射(切换日由 route-map-m4.sql 落库),此处仅 upsert 自愈不清理
  beforeAll(async () => {
    for (const tool of TOOL_PAGES) {
      const oldKey = `page_id:${tool.legacyPageId}`;
      await prisma.routeMap.upsert({
        where: { oldKey },
        create: { oldKey, newPath: tool.path },
        update: { newPath: tool.path, enabled: true },
      });
    }
    invalidateRouteCache();
  });

  afterAll(() => invalidateRouteCache());

  it("六键全部命中且指向六薄壳路由", async () => {
    for (const tool of TOOL_PAGES) {
      await expect(
        lookupLegacyRoute(`page_id:${tool.legacyPageId}`),
      ).resolves.toBe(tool.path);
    }
  });
});
