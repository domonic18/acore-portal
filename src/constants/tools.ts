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
  /** 页内大标题(短标签;p05/p06 设计稿)。缺省取 title */
  heading?: string;
  /** 标题右侧副标(p05/p06 设计稿) */
  tagline?: string;
  /** 浏览器框 URL 后缀说明(p05/p06 设计稿) */
  browserHint?: string;
  /** 来源 chip 展示用地址(缺省 iframeSrc;DKP 设计稿显示省略号) */
  chipLabel?: string;
  /** 页内 tab 组(p05 数据库三页);未设则不渲染 tab */
  tabs?: boolean;
  /** 外部系统提示条(p06 DKP);设计稿桌面在框上方、移动在框下方 */
  notice?: string;
};

export const TOOL_PAGES: readonly ToolPageMeta[] = [
  {
    path: "/online",
    title: "在线查询",
    iframeSrc: `${RANK_BASE}/ranking`,
    legacyPageId: 1287,
    nav: null,
    heading: "在线查询",
    tagline: "按角色名 / 阵营 / 职业 / 成就查询 · TitanEye 数据源",
    browserHint: "— Character Ranking & Search",
  },
  {
    path: "/online-players",
    title: "在线玩家",
    iframeSrc: `${RANK_BASE}/online`,
    legacyPageId: 1897,
    nav: "database",
    heading: "在线玩家",
    tagline: "当前在线 · 阵营 / 种族 / 职业 / 位置 · 30s 自动刷新",
    browserHint: "— Live Players",
    tabs: true,
  },
  {
    path: "/playermap",
    title: "在线地图",
    iframeSrc: `${RANK_BASE}/playermap`,
    legacyPageId: 4371,
    nav: "database",
    heading: "在线地图",
    tagline: "世界地图 · 在线角色实时点位 · 点击查看角色",
    browserHint: "— Live Player Map",
    tabs: true,
  },
  {
    path: "/hardcore",
    title: "英雄榜（硬核挑战）",
    iframeSrc: `${RANK_BASE}/hardcore`,
    legacyPageId: 1880,
    nav: "database",
    heading: "英雄榜",
    tagline: "泰坦之眼 TitanEye · 硬核模式 · 死亡即终局",
    browserHint: "— TitanEye Hardcore Leaderboard",
    tabs: true,
  },
  {
    path: "/banlist",
    title: "封号记录",
    iframeSrc: `${RANK_BASE}/banlist`,
    legacyPageId: 537,
    nav: "announce",
    heading: "封号记录",
    tagline: "违规公示 · 封禁原因 / 时长 / 泰坦之眼 AI 审查标记",
    browserHint: "— Ban List",
  },
  {
    path: "/dkp",
    title: "DKP 查询",
    iframeSrc: DKP_URL,
    legacyPageId: 1699,
    nav: "database",
    heading: "DKP查询",
    tagline: "团本 DKP 积分 · 公会 DKP 账本 · 外部第三方系统",
    browserHint: "— NFU WebDKP（外部域）",
    chipLabel: "https://webdkp.nfuwow.com/...",
    notice:
      "外部系统提示：DKP 页面嵌入第三方 NFU DKP 服务（非 rank 子站），原站即如此。重开发保留 iframe 直嵌；若第三方不可用，显示引导卡并附直达链接 webdkp.nfuwow.com",
  },
];

/**
 * p05 数据库页内 tab(硬核天梯/在线玩家/在线地图)。
 * 设计稿英雄榜屏另有「满级榜/成就榜」,属 rank 子站内部视图、无站内路由,不渲染死链。
 */
export const TOOL_DATABASE_TABS = [
  { label: "硬核天梯", path: "/hardcore" },
  { label: "在线玩家", path: "/online-players" },
  { label: "在线地图", path: "/playermap" },
] as const;

export function findToolPage(path: string): ToolPageMeta | undefined {
  return TOOL_PAGES.find((p) => p.path === path);
}
