/**
 * M4 工具页常量(research R7/R8):rank.lokta.cn 独立服务 iframe 嵌入,DKP 独立站。
 * 六页 meta 契约表=页面薄壳/tools-iframe/route_map-m4.sql/单测四方共同契约源
 * (contracts/tools-and-seo §六工具页;SC-301)。
 */
export const RANK_BASE = "https://rank.lokta.cn";
export const DKP_URL = "https://webdkp.nfuwow.com";

/** iframe 加载超时降级卡「工具服务暂不可用」(tools-iframe) */
export const TOOLS_IFRAME_TIMEOUT_MS = 12_000;

export type ToolNavSlot = "announce" | "database" | null;

export type ToolPageMeta = {
  /** 站内路由(薄壳页) */
  path: `/${string}`;
  /** metadata 标题 */
  title: string;
  /** iframe 目标 */
  iframeSrc: string;
  /** 旧站 page_id(route_map-m4.sql 301 键) */
  legacyPageId: number;
  /** 导航位置;null=不进导航(在线查询,旧站口径直达+301 可达) */
  nav: ToolNavSlot;
};

export const TOOL_PAGES: readonly ToolPageMeta[] = [
  {
    path: "/online",
    title: "在线查询",
    iframeSrc: `${RANK_BASE}/ranking`,
    legacyPageId: 1287,
    nav: null,
  },
  {
    path: "/online-players",
    title: "在线玩家",
    iframeSrc: `${RANK_BASE}/online`,
    legacyPageId: 1897,
    nav: "database",
  },
  {
    path: "/playermap",
    title: "在线地图",
    iframeSrc: `${RANK_BASE}/playermap`,
    legacyPageId: 4371,
    nav: "database",
  },
  {
    path: "/hardcore",
    title: "英雄榜（硬核挑战）",
    iframeSrc: `${RANK_BASE}/hardcore`,
    legacyPageId: 1880,
    nav: "database",
  },
  {
    path: "/banlist",
    title: "封号记录",
    iframeSrc: `${RANK_BASE}/banlist`,
    legacyPageId: 537,
    nav: "announce",
  },
  {
    path: "/dkp",
    title: "DKP 查询",
    iframeSrc: DKP_URL,
    legacyPageId: 1699,
    nav: "database",
  },
];

export function findToolPage(path: string): ToolPageMeta | undefined {
  return TOOL_PAGES.find((p) => p.path === path);
}
