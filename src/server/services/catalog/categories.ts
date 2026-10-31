import "server-only";
import { prisma } from "@/lib/db";

/** 分类目录(导航/筛选;存量 14 分类平铺,sort 升序) */
export async function listCategories(): Promise<
  { id: string; name: string; slug: string }[]
> {
  const rows = await prisma.productCategory.findMany({
    orderBy: { sort: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return rows.map((r) => ({ id: r.id.toString(), name: r.name, slug: r.slug }));
}
