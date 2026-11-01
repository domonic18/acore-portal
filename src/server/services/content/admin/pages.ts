import "server-only";
import { prisma } from "@/lib/db";
import { RESERVED_SLUGS } from "@/constants/content";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { ContentAdminError, type ContentStatus } from "./shared";

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
