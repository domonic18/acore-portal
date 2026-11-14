/** 内容域常量(M3):归档分类配置/静态页保留字/侧栏页面类型映射 */

/** 文章归档路由与分类 slug 一一对应(FR-209) */
export const ARCHIVE_CATEGORIES = [
  { slug: "announcements", name: "公告" },
  { slug: "news", name: "资讯" },
  { slug: "guides", name: "资料梳理" },
] as const;

export type ArchiveCategorySlug = (typeof ARCHIVE_CATEGORIES)[number]["slug"];

/** 归档 slug 集合(运行时校验用) */
export const ARCHIVE_SLUGS: readonly string[] = ARCHIVE_CATEGORIES.map((c) => c.slug);

/**
 * 静态页保留字清单(R15):content_page slug 禁止抢占代码持有的顶级路由段。
 * 首页/认证/账户/后台/商城/论坛/内容路由全部在内;核心内容页
 * (about/tutorial/agreement/convention/sitemap/devlog)不在清单——它们本身就是内容页。
 * 与 src/app 顶级路由段一一对应(issue #83:tests/unit/reserved-slugs.test.ts 机械校验)。
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
  "reset-password",
  "post",
  "news",
  "announcements",
  "guides",
  "progression",
  "legacy-redirect",
  "banlist",
  "dkp",
  "hardcore",
  "online",
  "online-players",
  "playermap",
  "uploads",
  "wp-admin",
];

/**
 * 核心静态页 slug(US3:generateStaticParams 预渲染集)
 * 这几个 slug 被页头/页脚/快捷入口/网站地图等代码引用,删除或改别名会让站内
 * 固定链接 404,故后台禁止删除与改别名(issue #94)。
 */
export const CORE_PAGE_SLUGS: readonly string[] = [
  "about",
  "tutorial",
  "agreement",
  "convention",
  "sitemap",
  "devlog",
];

/**
 * 首页轮播空物料时的兜底链接(默认 hero 图可点,落项目简介页)。
 * 目标须是已发布的核心页,否则兜底图点了会 404。
 */
export const HOME_CAROUSEL_FALLBACK_HREF = "/about";

/**
 * 正文由代码生成的静态页(issue #94):/sitemap 的链接分组按栏目/论坛版块/商城
 * 分类实时生成(content_page.body_md 只是可选导语),后台编辑器若只暴露
 * body_md 会出现「编辑器空、前台有」的割裂,故这类页在后台展示生成结果预览。
 */
export const SYSTEM_GENERATED_PAGE_SLUGS: readonly string[] = ["sitemap"];

/** 网站地图分组(前台 /sitemap 与后台预览共用;链接标签 + 站内路径) */
export type SiteMapGroup = {
  name: string;
  links: { label: string; href: string }[];
};

/**
 * 教程内容升格映射(2026-11-03):快捷操作类指南从「文章」升格为「静态页」,
 * 获得稳定 slug 与根级路由;旧 /post/{oldSlug} 外链/内链由 post/[slug] 层
 * permanentRedirect 兜底(308)。文章行随迁移删除,不做双份内容。
 */
export const PROMOTED_GUIDE_PAGES = [
  { oldSlug: "硬核挑战模式一命模式", slug: "hardcore-mode", title: "硬核模式介绍" },
  {
    oldSlug: "魔兽国服关服后错过的坐骑盘点-101款坐骑获取方式",
    slug: "mount-guide",
    title: "坐骑掉落与获取指南",
  },
  {
    oldSlug: "【教程】魔兽世界3-35高清端试用指南",
    slug: "hd-client",
    title: "高清端下载与试用指南",
  },
  { oldSlug: "客户端下载解压方法", slug: "client-extract", title: "客户端下载解压方法" },
  { oldSlug: "关于登录不了游戏的排查方法", slug: "login-troubleshoot", title: "常见登录问题排查" },
  { oldSlug: "经验加成合剂显示问号解决方法", slug: "patch-guide", title: "补丁说明与生效方法" },
] as const;

/** 旧文章 slug → 升格静态页路径(301 查找表) */
export const PROMOTED_GUIDE_MAP: Record<string, string> = Object.fromEntries(
  PROMOTED_GUIDE_PAGES.map((p) => [p.oldSlug, `/${p.slug}`]),
);

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
 * 侧栏固定组件注册键:代码内置组件,渲染顺序=数组顺序(数据卡在前,工具卡在后);
 * 每个组件在哪些页面类型出现由 sidebar_component 表后台配置
 * (行缺失回落 DEFAULT_COMPONENT_PAGES),组件本体不可增删(注册表=代码)。
 * 2026-11-05 积分余额组件下线(积分显示收敛至页头头像下拉)。
 */
export const SIDEBAR_COMPONENT_KEYS = [
  "server-status",
  "latest-news",
  "qq-group",
] as const;

export type SidebarComponentKey = (typeof SIDEBAR_COMPONENT_KEYS)[number];

/**
 * 内置组件缺省页面范围(sidebar_component 行缺失时兜底),等价 2026-11-05 前写死行为:
 * QQ 群随快捷卡页;在线人数/最新资讯为文章页右栏 ArticleAside 直出(已并入注册表)。
 */
export const DEFAULT_COMPONENT_PAGES: Record<
  SidebarComponentKey,
  readonly SitePageType[]
> = {
  "server-status": ["article"],
  "latest-news": ["article"],
  "qq-group": ["home", "article", "page"],
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

/** 内容页右栏常用功能(ardot p04 侧栏;链接落站内真实路由) */
export const ARCHIVE_COMMON_LINKS = [
  { label: "注册账号", href: "/register" },
  { label: "积分商店", href: "/shop" },
  { label: "封号记录", href: "/banlist" },
  { label: "DKP 查询", href: "/dkp" },
] as const;

/**
 * Markdown 正文排版基线(强调/列表/代码):静态页、文章/商品详情、版块描述与论坛
 * 正文共用同一套规则(2026-11-05 修「标识看不出效果」):
 * - 正文色(text-body)下 strong 与正文同色,加粗看不出差别,改用主题强调色(text-highlight);
 * - Tailwind v4 preflight 清空 list-style 与标题字号,有序/无序列表标记需显式恢复;
 * - 行内 code 与代码块区分(块内 code 不再叠加深底与内边距)。
 */
export const MARKDOWN_TYPOGRAPHY_CLS = [
  "[&_strong]:font-bold [&_strong]:text-highlight",
  "[&_em]:italic [&_em]:text-heading",
  "[&_del]:text-muted [&_del]:line-through",
  "[&_code]:rounded [&_code]:bg-panel-inset [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-num",
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-panel-inset [&_pre]:p-4",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13.5px] [&_pre_code]:text-body",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5",
  "[&_li::marker]:text-link",
].join(" ");

/** Markdown 渲染体共享样式(前台详情/静态页与后台编辑器预览同源,所见即所得) */
export const MARKDOWN_BODY_CLS = [
  "mt-6 max-w-none space-y-4 text-[15px] leading-8 text-body",
  // 正文 h1 与页面标题重复(详情页页头已渲染标题),隐藏避免同页两个 h1
  "[&_h1]:hidden",
  // 锚点跳转落点下移:吸顶页头 88px+间距,否则目标标题被页头遮住
  "[&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:border-l-[3px] [&_h2]:border-accent [&_h2]:pl-3 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:leading-7 [&_h2]:text-heading",
  "[&_h3]:mt-5 [&_h3]:scroll-mt-24 [&_h3]:text-[17px] [&_h3]:font-bold [&_h3]:text-heading",
  "[&_h4]:scroll-mt-24 [&_h4]:font-bold [&_h4]:text-foreground",
  "[&_a]:text-link",
  "[&_img]:max-w-full [&_img]:rounded-lg",
  "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-line [&_th]:bg-panel-inset [&_th]:px-2.5 [&_th]:py-1.5",
  "[&_blockquote]:border-l-[3px] [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-muted",
  MARKDOWN_TYPOGRAPHY_CLS,
].join(" ");

/** 论坛正文排版(楼层正文与编辑器实时预览同源,保证所见即所得) */
export const FORUM_POST_BODY_CLS = [
  "forum-post-body text-[14px] leading-[1.9] text-body",
  "[&_a]:text-link [&_a:hover]:text-highlight",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
  "[&_p]:my-2",
  MARKDOWN_TYPOGRAPHY_CLS,
].join(" ");
