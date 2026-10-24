/** 内容域常量(M3):归档分类配置/静态页保留字/侧栏页面类型映射 */

/** 文章归档路由与分类 slug 一一对应(FR-209;devlog 为第 4 分类同模式扩展) */
export const ARCHIVE_CATEGORIES = [
  { slug: "announcements", name: "公告" },
  { slug: "news", name: "资讯" },
  { slug: "guides", name: "资料梳理" },
  { slug: "devlog", name: "开发日志" },
] as const;

export type ArchiveCategorySlug = (typeof ARCHIVE_CATEGORIES)[number]["slug"];

export const ARCHIVE_PAGE_SIZE = 10;

/** 归档 slug 集合(运行时校验用) */
export const ARCHIVE_SLUGS: readonly string[] = ARCHIVE_CATEGORIES.map((c) => c.slug);

/**
 * 静态页保留字清单(R15):content_page slug 禁止抢占代码持有的顶级路由段。
 * 首页/认证/账户/后台/商城/论坛/内容路由全部在内;5 个核心内容页
 * (about/tutorial/agreement/convention/sitemap)不在清单——它们本身就是内容页。
 */
export const RESERVED_SLUGS: readonly string[] = [
  "shop",
  "cart",
  "checkout",
  "account",
  "admin",
  "forum",
  "api",
  "login",
  "register",
  "logout",
  "forgot-password",
  "post",
  "news",
  "announcements",
  "guides",
  "devlog",
  "progression",
  "legacy-redirect",
];

/** 核心静态页 slug(US3:generateStaticParams 预渲染集) */
export const CORE_PAGE_SLUGS = [
  "about",
  "tutorial",
  "agreement",
  "convention",
  "sitemap",
] as const;

/**
 * 侧栏组件注册键与页面类型清单映射(research R9):
 * 十二组件=10 个注册项(外部三链单组件含 3 链接)。
 * 清单调整=改本常量,不做后台可视化配置(Q4 最小集)。
 */
export const SIDEBAR_COMPONENT_KEYS = [
  "search",
  "announcement-banners",
  "client-download",
  "launcher-download",
  "yy-channel",
  "external-links",
  "addon-download",
  "calendar-archive",
  "points-balance",
  "recent-products",
] as const;

export type SidebarComponentKey = (typeof SIDEBAR_COMPONENT_KEYS)[number];
export type SitePageType =
  | "home"
  | "archive"
  | "article"
  | "page"
  | "progression"
  | "forum"
  | "shop";

export const SIDE_BY_PAGE_TYPE: Record<SitePageType, readonly SidebarComponentKey[]> = {
  home: [
    "search",
    "announcement-banners",
    "external-links",
    "calendar-archive",
    "points-balance",
    "recent-products",
  ],
  archive: ["search", "announcement-banners", "external-links", "calendar-archive"],
  article: [
    "search",
    "announcement-banners",
    "client-download",
    "launcher-download",
    "yy-channel",
    "external-links",
    "addon-download",
    "calendar-archive",
    "points-balance",
    "recent-products",
  ],
  page: [
    "search",
    "announcement-banners",
    "client-download",
    "launcher-download",
    "yy-channel",
    "external-links",
    "addon-download",
    "calendar-archive",
    "points-balance",
    "recent-products",
  ],
  progression: ["search", "announcement-banners", "external-links", "calendar-archive"],
  forum: ["search", "announcement-banners", "external-links", "calendar-archive"],
  shop: ["search", "announcement-banners", "external-links", "recent-products"],
};

/** 外部三链(侧栏友情链接;旧站静态事实) */
export const EXTERNAL_LINKS = [
  { label: "Wowhead 数据库", href: "https://www.wowhead.com" },
  { label: "NGA 玩家社区", href: "https://nga.178.com" },
  { label: "魔兽世界官网", href: "https://www.worldofwarcraft.com" },
] as const;

/** 下载与频道入口(旧站静态事实;客户端/登录器/插件实际文件在教程页下载卡) */
export const DOWNLOAD_LINKS = {
  client: { label: "客户端下载", href: "/tutorial", note: "1.12 完整客户端" },
  launcher: { label: "登录器下载", href: "/tutorial", note: "一键登录" },
  addon: { label: "插件下载", href: "/tutorial", note: "整合包" },
  yy: { label: "YY 频道", href: "#", note: "频道号见公告" },
} as const;
