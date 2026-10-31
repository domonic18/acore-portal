import "server-only";
import { prisma } from "@/lib/db";

/**
 * 内容查询层(M3 US3 T022 前台全量):
 * 归档分页/文章详情/阅读计数(R2 原子自增)/最新公告。
 */

export async function listLatestAnnouncements(limit = 3) {
  return prisma.article.findMany({
    where: { status: "published", category: { slug: "announcements" } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, title: true, publishedAt: true },
  });
}

/** 热门资讯(内容页右栏,p04):资讯分类按 views 取头部 */
export async function listHotNews(limit = 5) {
  return prisma.article.findMany({
    where: { status: "published", category: { slug: "news" } },
    orderBy: [{ views: "desc" }, { publishedAt: "desc" }],
    take: limit,
    select: { slug: true, title: true, views: true },
  });
}

/** 最新资讯(文章详情右栏,p04):资讯分类 publishedAt 倒序 */
export async function listLatestNews(limit = 5) {
  return prisma.article.findMany({
    where: { status: "published", category: { slug: "news" } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: limit,
    select: { slug: true, title: true, publishedAt: true },
  });
}

/** 归档列表(FR-209):published 过滤,publishedAt 倒序,10/页分页,标题搜索 */
export async function listArchiveArticles(opts: {
  categorySlug?: string;
  page?: number;
  pageSize?: number;
  q?: string;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 10));
  const where = {
    status: "published" as const,
    ...(opts.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
    ...(opts.q ? { title: { contains: opts.q } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        views: true,
      },
    }),
    prisma.article.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** 文章详情(FR-210):published 直达,draft/缺失 null */
export async function getArticleBySlug(slug: string) {
  return prisma.article.findFirst({
    where: { slug, status: "published" },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      bodyMd: true,
      publishedAt: true,
      updatedAt: true,
      views: true,
      categoryId: true,
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
    },
  });
}

/**
 * 同分类上一篇/下一篇(p04 详情页脚,publishedAt desc,id desc 同序):
 * prev=更新的一篇(向前翻),next=更旧的一篇;跨分类不串。
 */
export async function getAdjacentArticles(article: {
  id: bigint;
  categoryId: bigint;
  publishedAt: Date | null;
}): Promise<{ prev: { slug: string; title: string } | null; next: { slug: string; title: string } | null }> {
  const base = { status: "published" as const, categoryId: article.categoryId };
  const pick = (dir: "prev" | "next") => {
    if (!article.publishedAt) return Promise.resolve(null);
    const newer = dir === "prev";
    return prisma.article.findFirst({
      where: {
        ...base,
        OR: newer
          ? [
              { publishedAt: { gt: article.publishedAt } },
              { publishedAt: article.publishedAt, id: { gt: article.id } },
            ]
          : [
              { publishedAt: { lt: article.publishedAt } },
              { publishedAt: article.publishedAt, id: { lt: article.id } },
            ],
      },
      orderBy: newer
        ? [{ publishedAt: "asc" as const }, { id: "asc" as const }]
        : [{ publishedAt: "desc" as const }, { id: "desc" as const }],
      select: { slug: true, title: true },
    });
  };
  const [prev, next] = await Promise.all([pick("prev"), pick("next")]);
  return { prev, next };
}

/** 阅读计数(R2/SC-203):单条 UPDATE 原子自增;draft/缺失返回 null 不计数 */
export async function incrementArticleViews(slug: string): Promise<number | null> {
  const res = await prisma.article.updateMany({
    where: { slug, status: "published" },
    data: { views: { increment: 1 } },
  });
  if (res.count === 0) return null;
  const row = await prisma.article.findUnique({
    where: { slug },
    select: { views: true },
  });
  return row?.views ?? null;
}
