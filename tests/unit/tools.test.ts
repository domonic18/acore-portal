import { describe, expect, it } from "vitest";
import {
  DKP_URL,
  RANK_BASE,
  TOOL_PAGES,
  findToolPage,
} from "@/constants/tools";
import { SITE_NAV } from "@/constants/navigation";

/**
 * T002 前置(SC-301 锚点):六工具页契约表自洽 + 与导航 m4 占位对齐。
 * 该表同时是页面薄壳/tools-iframe/route_map-m4.sql/legacy-redirect 的契约源。
 */
const CONTRACT_REPLAY: readonly [string, string, number][] = [
  ["/online", "https://rank.lokta.cn/ranking", 1287],
  ["/online-players", "https://rank.lokta.cn/online", 1897],
  ["/playermap", "https://rank.lokta.cn/playermap", 4371],
  ["/hardcore", "https://rank.lokta.cn/hardcore", 1880],
  ["/banlist", "https://rank.lokta.cn/banlist", 537],
  ["/dkp", "https://webdkp.nfuwow.com", 1699],
];

describe("TOOL_PAGES 六工具页契约表(SC-301)", () => {
  it("六页路由/iframe 目标/旧 page_id 与契约表逐行一致", () => {
    expect(TOOL_PAGES).toHaveLength(6);
    CONTRACT_REPLAY.forEach(([path, iframeSrc, pageId]) => {
      const page = findToolPage(path);
      expect(page, `${path} 应在契约表`).toBeDefined();
      expect(page?.iframeSrc).toBe(iframeSrc);
      expect(page?.legacyPageId).toBe(pageId);
    });
  });

  it("iframe 目标只用 RANK_BASE/DKP_URL 两个外部源", () => {
    for (const p of TOOL_PAGES) {
      expect(
        p.iframeSrc === DKP_URL || p.iframeSrc.startsWith(`${RANK_BASE}/`),
        `${p.path} iframe 目标越出契约域`,
      ).toBe(true);
    }
  });

  it("路由与旧 page_id 均无重复(route_map 301 键一一对应)", () => {
    const paths = new Set(TOOL_PAGES.map((p) => p.path));
    const ids = new Set(TOOL_PAGES.map((p) => p.legacyPageId));
    expect(paths.size).toBe(6);
    expect(ids.size).toBe(6);
  });

  it("导航归属:仅在线查询不进导航;公告▾只挂封号记录,其余挂数据库▾", () => {
    const noNav = TOOL_PAGES.filter((p) => p.nav === null);
    expect(noNav.map((p) => p.path)).toEqual(["/online"]);

    const databasePaths = TOOL_PAGES.filter((p) => p.nav === "database").map(
      (p) => p.path,
    );
    expect(databasePaths).toEqual([
      "/online-players",
      "/playermap",
      "/hardcore",
      "/dkp",
    ]);
    expect(TOOL_PAGES.find((p) => p.path === "/banlist")?.nav).toBe("announce");
  });

  it("导航 m4 占位与契约表可对上(4 数据库项+封号记录;US1 接线时摘 m4 标记)", () => {
    const m4Items = SITE_NAV.flatMap((n) => n.children ?? []).filter(
      (c) => "m4" in c && c.m4,
    );
    expect(m4Items).toHaveLength(5);

    const dbLabels = SITE_NAV.find((n) => n.label === "数据库")?.children?.map(
      (c) => c.label,
    );
    const dbPaths = databasePathsFromLabels(dbLabels ?? []);
    expect(dbPaths).toEqual([
      "/hardcore",
      "/online-players",
      "/playermap",
      "/dkp",
    ]);
    expect(
      findToolPage("/banlist") &&
      m4Items.some((c) => c.label === "封号记录"),
    ).toBe(true);
  });

  function databasePathsFromLabels(labels: string[]): (string | undefined)[] {
    const labelToPath: Record<string, string> = {
      英雄榜: "/hardcore",
      在线玩家: "/online-players",
      在线地图: "/playermap",
      DKP查询: "/dkp",
    };
    return labels.map((l) => labelToPath[l]);
  }
});
