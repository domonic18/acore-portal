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
 * 五组件=下载四卡+积分余额(站内搜索/公告动态/友情链接/日历归档/最近浏览已下线)。
 * 清单调整=改本常量,不做后台可视化配置(Q4 最小集);空清单=页面无侧栏。
 */
export const SIDEBAR_COMPONENT_KEYS = [
  "client-download",
  "launcher-download",
  "yy-channel",
  "addon-download",
  "points-balance",
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
  home: ["points-balance"],
  archive: [],
  article: [
    "client-download",
    "launcher-download",
    "yy-channel",
    "addon-download",
    "points-balance",
  ],
  page: [
    "client-download",
    "launcher-download",
    "yy-channel",
    "addon-download",
    "points-balance",
  ],
  progression: [],
  forum: [],
  shop: [],
};

/** 下载与频道入口(侧栏下载卡)已迁移 settings download 组后台可配(链接空=隐藏卡片) */

/** Markdown 渲染体共享样式(前台详情/静态页与后台编辑器预览同源,所见即所得) */
export const MARKDOWN_BODY_CLS =
  "prose-invert mt-6 max-w-none space-y-4 text-sm leading-7 text-[#c7d2e0] [&_h2]:border-b [&_h2]:border-[#1e2a3d] [&_h2]:pb-1 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#e6d8a8] [&_h3]:pt-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#e6d8a8] [&_h4]:font-bold [&_h4]:text-[#c7d2e0] [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[#0d1728] [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#1e2a3d] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#1e2a3d] [&_th]:px-2 [&_th]:py-1";
