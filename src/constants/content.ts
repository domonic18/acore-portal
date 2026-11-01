/** 内容域常量(M3):归档分类配置/静态页保留字/侧栏页面类型映射 */

/** 文章归档路由与分类 slug 一一对应(FR-209) */
export const ARCHIVE_CATEGORIES = [
  { slug: "announcements", name: "公告" },
  { slug: "news", name: "资讯" },
  { slug: "guides", name: "资料梳理" },
] as const;

export type ArchiveCategorySlug = (typeof ARCHIVE_CATEGORIES)[number]["slug"];

export const ARCHIVE_PAGE_SIZE = 10;

/** 归档 slug 集合(运行时校验用) */
export const ARCHIVE_SLUGS: readonly string[] = ARCHIVE_CATEGORIES.map((c) => c.slug);

/**
 * 静态页保留字清单(R15):content_page slug 禁止抢占代码持有的顶级路由段。
 * 首页/认证/账户/后台/商城/论坛/内容路由全部在内;核心内容页
 * (about/tutorial/agreement/convention/sitemap/devlog)不在清单——它们本身就是内容页。
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
  "devlog",
] as const;

/**
 * 教程页下载章节锚点(规格 §菜单结构:客户端/登录器/补丁下载走锚点):
 * 沿用旧站 #client_download/#login_download/#patch_download,外链与站内菜单共用;
 * 渲染时按标题文案覆写 rehype-slug 生成的中文 id,正文标点/空格调整不影响跳转。
 */
export const TUTORIAL_ANCHORS = {
  client: "client_download",
  launcher: "login_download",
  patch: "patch_download",
} as const;

export const TUTORIAL_ANCHOR_ALIASES = [
  { id: TUTORIAL_ANCHORS.client, match: /下载客户端/ },
  { id: TUTORIAL_ANCHORS.launcher, match: /下载登录器/ },
  { id: TUTORIAL_ANCHORS.patch, match: /下载补丁/ },
] as const;

/** 侧栏页面类型(快捷卡 pages 取值范围;后台勾选与前台过滤共用) */
export const SITE_PAGE_TYPES = [
  "home",
  "archive",
  "article",
  "page",
  "progression",
  "forum",
  "shop",
] as const;

export type SitePageType = (typeof SITE_PAGE_TYPES)[number];

/**
 * 侧栏固定组件注册键(research R9):快捷卡已改为 sidebar_card 表后台 CRUD,
 * 此处仅保留代码内置组件(积分余额);空清单=该页面无固定组件。
 */
export const SIDEBAR_COMPONENT_KEYS = ["points-balance"] as const;

export type SidebarComponentKey = (typeof SIDEBAR_COMPONENT_KEYS)[number];

export const SIDE_BY_PAGE_TYPE: Record<SitePageType, readonly SidebarComponentKey[]> = {
  home: ["points-balance"],
  archive: [],
  // article 栏目卡改由 ArticleAside 直出(在线人数/最新资讯/公告推送,p04);
  // 注册表仅保留登录态积分余额
  article: ["points-balance"],
  page: ["points-balance"],
  progression: [],
  forum: [],
  shop: [],
};

/** 内容页右栏快捷入口(ardot p04 侧栏;链接落站内真实路由) */
export const ARCHIVE_ASIDE_LINKS = [
  { label: "项目简介", href: "/about" },
  { label: "使用教程", href: "/tutorial" },
  { label: "渐进计划", href: "/progression" },
  { label: "英雄榜", href: "/hardcore" },
  { label: "论坛", href: "/forum" },
  { label: "网站地图", href: "/sitemap" },
] as const;

/** 内容页右栏常用功能(ardot p04 侧栏) */
export const ARCHIVE_COMMON_LINKS = [
  { label: "注册账号", href: "/register" },
  { label: "积分商店", href: "/shop" },
  { label: "物品恢复", href: "/account/item-restore" },
  { label: "封号记录", href: "/banlist" },
  { label: "DKP 查询", href: "/dkp" },
] as const;

/** Markdown 渲染体共享样式(前台详情/静态页与后台编辑器预览同源,所见即所得) */
export const MARKDOWN_BODY_CLS =
  "prose-invert mt-6 max-w-none space-y-4 text-[15px] leading-8 text-[#93b2ce] [&_h2]:mt-8 [&_h2]:border-l-[3px] [&_h2]:border-[#5ea3cc] [&_h2]:pl-3 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:leading-7 [&_h2]:text-[#dcebf7] [&_h3]:mt-5 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-[#dcebf7] [&_h4]:font-bold [&_h4]:text-[#c7d5e6] [&_a]:text-[#6fb7e0] [&_img]:max-w-full [&_img]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#22385a] [&_pre]:bg-[#0d1828] [&_pre]:p-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#22385a] [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#22385a] [&_th]:bg-[#0d1828] [&_th]:px-2.5 [&_th]:py-1.5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#35577f] [&_blockquote]:pl-4 [&_blockquote]:text-[#6482a3]";
