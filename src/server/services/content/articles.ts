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
      category: { select: { name: true, slug: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
    },
  });
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
