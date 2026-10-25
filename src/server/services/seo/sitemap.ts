import { TOOL_PAGES } from "@/constants/tools";
import { prisma } from "@/lib/db";

/**
 * sitemap 条目构建(T035,契约 tools-and-seo §sitemap 口径):
 * 固定路由(首页/归档 4/渐进/论坛/商城/六工具页/静态页 4)+
 * 动态(文章 publish/商品 published 且 listed/版块/未关闭主题上限 5000);
 * draft、软删主题、listed=0 与 /admin/*、/account/*、/api/* 一律不含。
 */
export const SITEMAP_THREAD_LIMIT = 5000;

export type SitemapEntry = { path: string; lastModified?: Date };

/** 固定路由(次序即输出次序;静态页 4 为种子 content_page,固定收录) */
export const SITEMAP_FIXED_PATHS: readonly string[] = [
  "/",
  "/announcements",
  "/news",
  "/guides",
  "/devlog",
  "/progression",
  "/forum",
  "/shop",
  ...TOOL_PAGES.map((t) => t.path),
  "/about",
  "/tutorial",
  "/agreement",
  "/convention",
];

export async function buildSitemapEntries(): Promise<SitemapEntry[]> {
  const [articles, products, boards, threads] = await Promise.all([
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
  ]);

  return [
    ...SITEMAP_FIXED_PATHS.map((path) => ({ path })),
    ...articles.map((a) => ({ path: `/post/${a.slug}`, lastModified: a.updatedAt })),
    ...products.map((p) => ({ path: `/shop/${p.slug}` })),
    ...boards.map((b) => ({ path: `/forum/${b.slug}` })),
    ...threads.map((t) => ({ path: `/forum/thread/${t.id}` })),
  ];
}
