import "server-only";
import { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { ADMIN_ARTICLE_PAGE_SIZE } from "@/constants/pagination";
import { paginate } from "@/lib/pagination";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { ContentAdminError, type ContentStatus } from "./shared";

// ===== 文章 =====

export async function listAdminArticles(opts: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: ContentStatus;
}): Promise<{
  items: Array<{
    id: string;
    slug: string;
    title: string;
    status: string;
    views: number;
    publishedAt: string | null;
    categoryName: string;
  }>;
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const pageSize = Math.min(Math.max(opts.pageSize ?? ADMIN_ARTICLE_PAGE_SIZE, 1), 50);
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.q ? { title: { contains: opts.q } } : {}),
  };
  const total = await prisma.article.count({ where });
  const { totalPages, skip, take } = paginate(total, page, pageSize);
  const rows = await prisma.article.findMany({
    where,
    include: { category: { select: { name: true } } },
    orderBy: { id: "desc" },
    skip,
    take,
  });
  return {
    page,
    totalPages,
    total,
    items: rows.map((r) => ({
      id: r.id.toString(),
      slug: r.slug,
      title: r.title,
      status: r.status,
      views: r.views,
      publishedAt: r.publishedAt?.toISOString() ?? null,
      categoryName: r.category.name,
    })),
  };
}

export async function getAdminArticle(id: bigint) {
  const row = await prisma.article.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
    },
  });
  if (!row) return null;
  return {
    id: row.id.toString(),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    bodyMd: row.bodyMd,
    categoryId: row.categoryId.toString(),
    categoryName: row.category.name,
    status: row.status,
    views: row.views,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    tags: row.tags.map((t) => ({ id: t.tag.id.toString(), name: t.tag.name, slug: t.tag.slug })),
  };
}

/** slug 缺省:title 音译不可靠(中文)→ slugify 退化 + 时间戳后缀保证可保存 */
function autoSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `${base || "post"}-${Date.now().toString(36)}`;
}

async function resolveArticleSlug(
  slug: string | undefined,
  title: string,
  excludeId?: bigint,
): Promise<string> {
  const finalSlug = slug?.trim() || autoSlug(title);
  const clash = await prisma.article.findFirst({
    where: { slug: finalSlug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ContentAdminError("SLUG_CONFLICT", `别名 ${finalSlug} 已存在。`);
  return finalSlug;
}

export async function saveArticle(input: {
  id?: bigint;
  title: string;
  slug?: string;
  categoryId: bigint;
  bodyMd: string;
  excerpt?: string | null;
  status: ContentStatus;
  tagIds?: bigint[];
  actorUserId: bigint;
}): Promise<{ id: bigint }> {
  const category = await prisma.articleCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true },
  });
  if (!category) throw new ContentAdminError("CATEGORY_NOT_FOUND", "分类不存在。");
  const slug = await resolveArticleSlug(input.slug, input.title, input.id);

  const data = {
    title: input.title,
    slug,
    bodyMd: input.bodyMd,
    categoryId: input.categoryId,
    excerpt: input.excerpt ?? null,
    status: input.status,
  };

  const result = await prisma.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.article.findUnique({
        where: { id: input.id },
        select: { status: true, publishedAt: true },
      });
      if (!existing) throw new ContentAdminError("NOT_FOUND", "文章不存在。");
      // 发布流转(R15/契约):draft→published 写 publishedAt(保留首发);published→draft 置空
      const publishedAt =
        input.status === "published" ? (existing.publishedAt ?? new Date()) : null;
      await tx.article.update({ where: { id: input.id }, data: { ...data, publishedAt } });
      if (input.tagIds) await replaceArticleTags(tx, input.id, input.tagIds);
      return { id: input.id };
    }
    return tx.article.create({
      data: {
        ...data,
        publishedAt: input.status === "published" ? new Date() : null,
        tags: input.tagIds
          ? { createMany: { data: input.tagIds.map((tagId) => ({ tagId })) } }
          : undefined,
      },
      select: { id: true },
    });
  });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_ARTICLE_SAVED,
    actorUserId: input.actorUserId,
    payload: { id: result.id.toString(), slug, status: input.status },
  });
  return result;
}

async function replaceArticleTags(tx: Prisma.TransactionClient, articleId: bigint, tagIds: bigint[]): Promise<void> {
  await tx.articleTag.deleteMany({ where: { articleId } });
  if (tagIds.length > 0) {
    await tx.articleTag.createMany({
      data: tagIds.map((tagId) => ({ articleId, tagId })),
      skipDuplicates: true,
    });
  }
}

export async function setArticleTags(
  id: bigint,
  tagIds: bigint[],
  actorUserId: bigint,
): Promise<void> {
  const hit = await prisma.article.findUnique({ where: { id }, select: { id: true } });
  if (!hit) throw new ContentAdminError("NOT_FOUND", "文章不存在。");
  await prisma.$transaction(async (tx) => {
    await replaceArticleTags(tx, id, tagIds);
  });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_TAXONOMY_SAVED,
    actorUserId,
    payload: { articleId: id.toString(), tagIds: tagIds.map(String) },
  });
}

export async function deleteArticle(id: bigint, actorUserId: bigint): Promise<void> {
  const row = await prisma.article.delete({ where: { id }, select: { slug: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_ARTICLE_DELETED,
    actorUserId,
    payload: { id: id.toString(), slug: row.slug },
  });
}
