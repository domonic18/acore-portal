import "server-only";
import { prisma } from "@/lib/db";

/** 静态页查询(M3 US3 T022;根级 /{slug} 兜底路由数据面,FR-210) */

export async function getPublishedPage(slug: string) {
  return prisma.contentPage.findFirst({
    where: { slug, status: "published" },
    select: { slug: true, title: true, bodyMd: true, updatedAt: true },
  });
}

/** 网站地图页清单(按 sort_order) */
export async function listPublishedPages() {
  return prisma.contentPage.findMany({
    where: { status: "published" },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { slug: true, title: true },
  });
}
