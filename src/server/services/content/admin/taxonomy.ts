import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { ContentAdminError } from "./shared";

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
  actorUserId: bigint;
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
    await writeAudit({
      category: AUDIT_CATEGORY.CONTENT,
      action: AUDIT_ACTION.CONTENT_TAXONOMY_SAVED,
      actorUserId: input.actorUserId,
      payload: { type: "category", id: input.id.toString(), slug: input.slug },
    });
    return { id: input.id };
  }
  const created = await prisma.articleCategory.create({
    data: { name: input.name, slug: input.slug, sort: input.sort },
    select: { id: true },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_TAXONOMY_SAVED,
    actorUserId: input.actorUserId,
    payload: { type: "category", id: created.id.toString(), slug: input.slug },
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

export async function saveTag(input: {
  id?: bigint;
  name: string;
  slug: string;
  actorUserId: bigint;
}): Promise<{ id: bigint }> {
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
    await writeAudit({
      category: AUDIT_CATEGORY.CONTENT,
      action: AUDIT_ACTION.CONTENT_TAXONOMY_SAVED,
      actorUserId: input.actorUserId,
      payload: { type: "tag", id: input.id.toString(), slug: input.slug },
    });
    return { id: input.id };
  }
  const created = await prisma.tag.create({
    data: { name: input.name, slug: input.slug },
    select: { id: true },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_TAXONOMY_SAVED,
    actorUserId: input.actorUserId,
    payload: { type: "tag", id: created.id.toString(), slug: input.slug },
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
