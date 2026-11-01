import "server-only";
import { prisma } from "@/lib/db";

// ===== 分类管理(平铺排序) =====

export class CategoryAdminError extends Error {
  constructor(
    public code: "DUPLICATE" | "NOT_FOUND",
    message?: string,
  ) {
    super(message ?? `category_admin_error: ${code}`);
    this.name = "CategoryAdminError";
  }
}

export async function listAdminCategories() {
  const rows = await prisma.productCategory.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    name: r.name,
    slug: r.slug,
    sort: r.sort,
    productCount: r._count.products,
  }));
}

export async function saveCategory(input: {
  id?: bigint;
  name: string;
  slug: string;
  sort: number;
}): Promise<{ id: bigint }> {
  const clash = await prisma.productCategory.findFirst({
    where: { slug: input.slug, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (clash) throw new CategoryAdminError("DUPLICATE", `分类别名 ${input.slug} 已存在。`);
  if (input.id) {
    const hit = await prisma.productCategory.updateMany({
      where: { id: input.id },
      data: { name: input.name, slug: input.slug, sort: input.sort },
    });
    if (hit.count === 0) throw new CategoryAdminError("NOT_FOUND", "分类不存在。");
    return { id: input.id };
  }
  const created = await prisma.productCategory.create({
    data: { name: input.name, slug: input.slug, sort: input.sort },
    select: { id: true },
  });
  return { id: created.id };
}
