import "server-only";
import { prisma } from "@/lib/db";

/** 文章分类查询(M3 US3 T022;归档导航/侧栏数据面) */

export async function listArticleCategories() {
  return prisma.articleCategory.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { name: true, slug: true, sort: true },
  });
}
