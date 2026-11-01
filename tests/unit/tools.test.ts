import { describe, expect, it } from "vitest";
import {
  TOOL_DATABASE_TABS,
  TOOL_PAGES,
  findToolPage,
  resolveToolIframeSrc,
  toToolPageView,
  type ToolSource,
} from "@/constants/tools";
import { SITE_NAV } from "@/constants/navigation";

/**
 * T002 前置(SC-301 锚点):六工具页契约表自洽 + 与导航 m4 占位对齐。
 * 该表同时是页面薄壳/tools-iframe/route_map-m4.sql/legacy-redirect 的契约源;
 * 外部域地址来自运行时配置(tools.rankBase/tools.dkpUrl),测试用固定基准拼期望值。
 */
const BASES = {
  rankBase: "https://rank.lokta.cn",
  dkpUrl: "https://webdkp.nfuwow.com",
};

const CONTRACT_REPLAY: readonly [string, ToolSource, string, number][] = [
  ["/online", "rank", "/ranking", 1287],
  ["/online-players", "rank", "/online", 1897],
  ["/playermap", "rank", "/playermap", 4371],
  ["/hardcore", "rank", "/hardcore", 1880],
  ["/banlist", "rank", "/banlist", 537],
  ["/dkp", "dkp", "", 1699],
];

describe("TOOL_PAGES 六工具页契约表(SC-301)", () => {
  it("六页路由/iframe 目标/旧 page_id 与契约表逐行一致", () => {
    expect(TOOL_PAGES).toHaveLength(6);
    CONTRACT_REPLAY.forEach(([path, source, externalPath, pageId]) => {
      const page = findToolPage(path);
      expect(page, `${path} 应在契约表`).toBeDefined();
      expect(page?.source).toBe(source);
      expect(page?.externalPath).toBe(externalPath);
      expect(page?.legacyPageId).toBe(pageId);
      const expected =
        source === "dkp" ? BASES.dkpUrl : `${BASES.rankBase}${externalPath}`;
      expect(resolveToolIframeSrc(page!, BASES)).toBe(expected);
    });
  });

  it("iframe 目标只用 rank/dkp 两个配置源(常量内不存外部域)", () => {
    for (const p of TOOL_PAGES) {
      const src = resolveToolIframeSrc(p, BASES);
      expect(
        src === BASES.dkpUrl || src.startsWith(`${BASES.rankBase}/`),
        `${p.path} iframe 目标越出契约域`,
      ).toBe(true);
    }
  });

  it("配置地址去尾斜杠,DKP chip 由同一配置拼出", () => {
    const bases = { rankBase: "https://rank.example/", dkpUrl: "https://dkp.example/" };
    expect(toToolPageView(findToolPage("/hardcore")!, bases).iframeSrc).toBe(
      "https://rank.example/hardcore",
    );
    const dkp = toToolPageView(findToolPage("/dkp")!, bases);
    expect(dkp.iframeSrc).toBe("https://dkp.example");
    expect(dkp.chipLabel).toBe("https://dkp.example/...");
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

  it("数据库页内 tab 只指向真实工具页(p05 设计稿无死链)", () => {
    expect(TOOL_DATABASE_TABS.map((t) => t.path)).toEqual([
      "/hardcore",
      "/online-players",
      "/playermap",
    ]);
    for (const tab of TOOL_DATABASE_TABS) {
      expect(findToolPage(tab.path)?.nav, `${tab.path} 应为数据库槽位工具页`).toBe(
        "database",
      );
    }
  });

  it("导航接线:五项工具页挂 SITE_NAV 真 href,在线查询不进导航(US1 T022)", () => {
    // 工具页只挂公告▾/数据库▾两个槽位
    const slots = SITE_NAV.filter((n) =>
      ["公告", "数据库"].includes(n.label),
    ).flatMap((n) => n.children ?? []);
    const toolHrefs = slots.map((c) => c.href).filter((h) => findToolPage(h));
    expect(toolHrefs.sort()).toEqual(
      ["/banlist", "/dkp", "/hardcore", "/online-players", "/playermap"].sort(),
    );
    // 槽位内非工具页子项仅公告▾的归档两键
    const nonTool = slots.filter((c) => !findToolPage(c.href));
    expect(nonTool.map((c) => c.href).sort()).toEqual([
      "/devlog",
      "/progression",
    ]);

    const byLabel = Object.fromEntries(
      SITE_NAV.map((n) => [n.label, n]),
    );
    expect(byLabel["数据库"]?.children?.map((c) => c.href)).toEqual([
      "/hardcore",
      "/online-players",
      "/playermap",
      "/dkp",
    ]);
    expect(
      byLabel["公告"]?.children?.find((c) => c.label === "封号记录")?.href,
    ).toBe("/banlist");
    // 两个工具槽位内任何子项不得指向契约表外的路由
    for (const c of slots) {
      expect(
        findToolPage(c.href) !== undefined ||
          ["/devlog", "/progression"].includes(c.href),
        `${c.href} 越出槽位契约`,
      ).toBe(true);
    }
  });
});
