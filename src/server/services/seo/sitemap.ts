import "server-only";
import { TOOL_PAGES } from "@/constants/tools";
import { prisma } from "@/lib/db";

/**
 * sitemap 条目构建(T035,契约 tools-and-seo §sitemap 口径):
 * 固定路由(首页/归档 3/渐进/论坛/商城/六工具页)+
 * 动态(已发布内容页/文章 publish/商品 published 且 listed/版块/未关闭主题上限 5000);
 * draft、软删主题、listed=0 与 /admin/*、/account/*、/api/* 一律不含。
 * 内容页(about/tutorial/agreement/convention/sitemap/devlog/升格指南页)统一由
 * content_page 表已发布行推导(issue #101:固定路由只列了 4 个静态页,
 * 其余公开内容页首页可达却漏收录)。
 */
export const SITEMAP_THREAD_LIMIT = 5000;

export type SitemapEntry = { path: string; lastModified?: Date };

/** 固定路由(次序即输出次序;均为代码持有的路由段,非 content_page 内容页) */
export const SITEMAP_FIXED_PATHS: readonly string[] = [
  "/",
  "/announcements",
  "/news",
  "/guides",
  "/progression",
  "/forum",
  "/shop",
  ...TOOL_PAGES.map((t) => t.path),
];

export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const [articles, products, boards, threads, pages] = await Promise.all([
    prisma.article.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.product.findMany({
      where: { status: "published", listed: true },
      select: { slug: true },
      orderBy: { id: "asc" },
    }),
    prisma.forumBoard.findMany({
      select: { slug: true },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    }),
    prisma.forumThread.findMany({
      where: { deletedAt: null, closedAt: null },
      select: { id: true },
      orderBy: { lastPostAt: "desc" },
      take: SITEMAP_THREAD_LIMIT,
    }),
    prisma.contentPage.findMany({
      where: { status: "published" },
      select: { slug: true, updatedAt: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  ]);

  return [
    ...SITEMAP_FIXED_PATHS.map((path) => ({ path })),
    ...pages.map((p) => ({ path: `/${p.slug}`, lastModified: p.updatedAt })),
    ...articles.map((a) => ({ path: `/post/${a.slug}`, lastModified: a.updatedAt })),
    ...products.map((p) => ({ path: `/shop/${p.slug}` })),
    ...boards.map((b) => ({ path: `/forum/${b.slug}` })),
    ...threads.map((t) => ({ path: `/forum/thread/${t.id}` })),
  ];
}

/**
 * /sitemap 网站地图页视图(2026-11-05 用户反馈:种子 content_page 正文为空,
 * 打开只有一个标题不像网站地图):主要栏目/玩家工具固定分组 + 论坛版块、
 * 商城分类动态分组。文章/商品/主题海量不做逐条罗列,归档入口可达即可。
 */
export type SiteMapGroup = {
  name: string;
  links: { label: string; href: string }[];
};

const FIXED_GROUPS: readonly SiteMapGroup[] = [
  {
    name: "主要栏目",
    links: [
      { label: "首页", href: "/" },
      { label: "公告", href: "/announcements" },
      { label: "资讯", href: "/news" },
      { label: "资料梳理", href: "/guides" },
      { label: "开发日志", href: "/devlog" },
      { label: "渐进计划", href: "/progression" },
      { label: "论坛", href: "/forum" },
      { label: "积分商店", href: "/shop" },
    ],
  },
  {
    name: "玩家工具",
    links: TOOL_PAGES.map((t) => ({ label: t.title, href: t.path })),
  },
  {
    name: "帮助与规则",
    links: [
      { label: "项目简介", href: "/about" },
      { label: "使用教程", href: "/tutorial" },
      { label: "用户协议", href: "/agreement" },
      { label: "论坛公约", href: "/convention" },
      { label: "网站地图", href: "/sitemap" },
      { label: "注册账号", href: "/register" },
      { label: "登录", href: "/login" },
    ],
  },
];

export async function getSiteMapPageView(): Promise<SiteMapGroup[]> {
  const [boards, categories] = await Promise.all([
    prisma.forumBoard.findMany({
      select: { name: true, slug: true },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    }),
    prisma.productCategory.findMany({
      select: { name: true, slug: true },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    }),
  ]);
  return [
    ...FIXED_GROUPS,
    {
      name: "论坛版块",
      links: boards.map((b) => ({ label: b.name, href: `/forum/${b.slug}` })),
    },
    {
      name: "商城分类",
      links: [
        ...categories.map((c) => ({
          label: c.name,
          href: `/shop?category=${encodeURIComponent(c.slug)}`,
        })),
        { label: "全部商品", href: "/shop" },
      ],
    },
  ];
}
