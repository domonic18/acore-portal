import "server-only";
import { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS } from "@/constants/content";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 内容后台最小集(api-admin-m3 契约,FR-215~217,Q4 无版本历史/审核流):
 * slug 唯一(冲突 SLUG_CONFLICT);页面 slug 保留字 SLUG_RESERVED;分类删除有引用
 * CATEGORY_IN_USE;发布流转写/清 publishedAt(重复发布保留首发时间);
 * 写操作审计 category=content 只记 id/slug 不记正文(T048 脱敏口径)。
 */

export class ContentAdminError extends Error {
  constructor(
    public code:
      | "SLUG_CONFLICT"
      | "SLUG_RESERVED"
      | "CATEGORY_IN_USE"
      | "DUPLICATE"
      | "NOT_FOUND"
      | "CATEGORY_NOT_FOUND",
    message?: string,
  ) {
    super(message ?? `content_admin_error: ${code}`);
    this.name = "ContentAdminError";
  }
}

type ContentStatus = "draft" | "published";

// ===== 文章 =====

export const ADMIN_ARTICLE_PAGE_SIZE = 20;

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
  const rows = await prisma.article.findMany({
    where,
    include: { category: { select: { name: true } } },
    orderBy: { id: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
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

// ===== 静态页 =====

export async function listAdminPages() {
  const rows = await prisma.contentPage.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    slug: r.slug,
    title: r.title,
    status: r.status,
    sortOrder: r.sortOrder,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getAdminPage(id: bigint) {
  const row = await prisma.contentPage.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id.toString(),
    slug: row.slug,
    title: row.title,
    bodyMd: row.bodyMd,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

async function resolvePageSlug(slug: string, excludeId?: bigint): Promise<string> {
  if (RESERVED_SLUGS.includes(slug)) {
    throw new ContentAdminError("SLUG_RESERVED", `别名 ${slug} 为系统保留路由。`);
  }
  const clash = await prisma.contentPage.findFirst({
    where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ContentAdminError("SLUG_CONFLICT", `别名 ${slug} 已存在。`);
  return slug;
}

export async function savePage(input: {
  id?: bigint;
  slug: string;
  title: string;
  bodyMd: string;
  status: ContentStatus;
  sortOrder?: number;
  actorUserId: bigint;
}): Promise<{ id: bigint }> {
  const slug = await resolvePageSlug(input.slug, input.id);
  const data = {
    slug,
    title: input.title,
    bodyMd: input.bodyMd,
    status: input.status,
    sortOrder: input.sortOrder ?? 0,
  };
  if (input.id) {
    const hit = await prisma.contentPage.updateMany({
      where: { id: input.id },
      data,
    });
    if (hit.count === 0) throw new ContentAdminError("NOT_FOUND", "页面不存在。");
    await writeAudit({
      category: AUDIT_CATEGORY.CONTENT,
      action: AUDIT_ACTION.CONTENT_PAGE_SAVED,
      actorUserId: input.actorUserId,
      payload: { id: input.id.toString(), slug, status: input.status },
    });
    return { id: input.id };
  }
  const created = await prisma.contentPage.create({ data, select: { id: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_PAGE_SAVED,
    actorUserId: input.actorUserId,
    payload: { id: created.id.toString(), slug, status: input.status },
  });
  return { id: created.id };
}

export async function deletePage(id: bigint, actorUserId: bigint): Promise<void> {
  const row = await prisma.contentPage.delete({ where: { id }, select: { slug: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_PAGE_DELETED,
    actorUserId,
    payload: { id: id.toString(), slug: row.slug },
  });
}

// ===== 文章分类/标签(契约:article-taxonomies) =====

export async function listAdminArticleCategories() {
  const rows = await prisma.articleCategory.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { articles: true } } },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    slug: r.slug,
    sort: r.sort,
    articleCount: r._count.articles,
  }));
}

export async function saveArticleCategory(input: {
  id?: bigint;
  name: string;
  slug: string;
  sort: number;
}): Promise<{ id: bigint }> {
  const clash = await prisma.articleCategory.findFirst({
    where: { slug: input.slug, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ContentAdminError("SLUG_CONFLICT", `分类别名 ${input.slug} 已存在。`);
  if (input.id) {
    const hit = await prisma.articleCategory.updateMany({
      where: { id: input.id },
      data: { name: input.name, slug: input.slug, sort: input.sort },
    });
    if (hit.count === 0) throw new ContentAdminError("NOT_FOUND", "分类不存在。");
    return { id: input.id };
  }
  const created = await prisma.articleCategory.create({
    data: { name: input.name, slug: input.slug, sort: input.sort },
    select: { id: true },
  });
  return { id: created.id };
}

export async function deleteArticleCategory(id: bigint, actorUserId: bigint): Promise<void> {
  const inUse = await prisma.article.count({ where: { categoryId: id } });
  if (inUse > 0) {
    throw new ContentAdminError("CATEGORY_IN_USE", `分类仍有 ${inUse} 篇文章引用,无法删除。`);
  }
  const row = await prisma.articleCategory.delete({ where: { id }, select: { slug: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_TAXONOMY_DELETED,
    actorUserId,
    payload: { type: "category", id: id.toString(), slug: row.slug },
  });
}

export async function listAdminTags() {
  const rows = await prisma.tag.findMany({
    orderBy: { id: "desc" },
    include: { _count: { select: { articles: true } } },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    slug: r.slug,
    articleCount: r._count.articles,
  }));
}

export async function saveTag(input: { id?: bigint; name: string; slug: string }): Promise<{ id: bigint }> {
  const clash = await prisma.tag.findFirst({
    where: {
      OR: [{ name: input.name }, { slug: input.slug }],
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { name: true, slug: true },
  });
  if (clash) {
    throw new ContentAdminError(
      "DUPLICATE",
      clash.name === input.name ? `标签 ${input.name} 已存在。` : `标签别名 ${input.slug} 已存在。`,
    );
  }
  if (input.id) {
    const hit = await prisma.tag.updateMany({
      where: { id: input.id },
      data: { name: input.name, slug: input.slug },
    });
    if (hit.count === 0) throw new ContentAdminError("NOT_FOUND", "标签不存在。");
    return { id: input.id };
  }
  const created = await prisma.tag.create({
    data: { name: input.name, slug: input.slug },
    select: { id: true },
  });
  return { id: created.id };
}

export async function deleteTag(id: bigint, actorUserId: bigint): Promise<void> {
  const row = await prisma.tag.delete({ where: { id }, select: { slug: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_TAXONOMY_DELETED,
    actorUserId,
    payload: { type: "tag", id: id.toString(), slug: row.slug },
  });
}
