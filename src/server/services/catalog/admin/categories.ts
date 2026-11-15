import "server-only";
import { prisma } from "@/lib/db";
import { buildCategoryTree, type CategoryNode } from "@/lib/catalog-tree";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";

// ===== 分类管理(树形父子聚合) =====

export class CategoryAdminError extends Error {
  constructor(
    public code: "DUPLICATE" | "NOT_FOUND" | "INVALID_PARENT" | "CYCLE",
    message?: string,
  ) {
    super(message ?? `category_admin_error: ${code}`);
    this.name = "CategoryAdminError";
  }
}

export type AdminCategoryNode = CategoryNode;

/** 扁平下拉项(商品筛选「所属分类」用):保留层级前缀,父子顺序与树一致 */
export type AdminCategoryOption = {
  id: string;
  name: string;
  slug: string;
  depth: number;
  productCount: number;
};

function flattenTree(
  nodes: CategoryNode[],
  depth = 0,
): { node: CategoryNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
}

/**
 * 分类树(与前台分面栏同一套父子聚合口径):
 * 计数分「自身商品数」(ownCount)与「子树合计」(subtreeCount),
 * 后台据此看清父分类下还剩几个子分类没货。
 */
export async function listAdminCategories(): Promise<AdminCategoryNode[]> {
  const rows = await prisma.productCategory.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return buildCategoryTree(
    rows.map((r) => ({
      id: r.id.toString(),
      name: r.name,
      slug: r.slug,
      parentId: r.parentId === null ? null : r.parentId.toString(),
      sort: r.sort,
      ownCount: r._count.products,
    })),
  );
}

/**
 * 扁平下拉项(商品筛选「所属分类」用):按树序排列并保留层级深度,
 * 计数是「该分类自身的商品数」(筛选按 category_id 精确匹配,父分类不含子分类)。
 */
export async function listAdminCategoryOptions(): Promise<AdminCategoryOption[]> {
  const tree = await listAdminCategories();
  return flattenTree(tree).map(({ node, depth }) => ({
    id: node.id,
    name: node.name,
    slug: node.slug,
    depth,
    productCount: node.ownCount,
  }));
}

/**
 * 上级分类合法性:不得指向自己或自己的子孙(否则树成环,前台子树计数与筛选结果全错)。
 * 沿父链逐级上溯,命中自身即环。
 */
async function assertParentAssignable(
  categoryId: bigint | undefined,
  parentId: bigint | null | undefined,
): Promise<void> {
  if (parentId === undefined || parentId === null) return;
  if (categoryId !== undefined && parentId === categoryId) {
    throw new CategoryAdminError("CYCLE", "上级分类不能是自己。");
  }
  const parent = await prisma.productCategory.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  });
  if (!parent) throw new CategoryAdminError("INVALID_PARENT", "上级分类不存在。");
  if (categoryId === undefined) return;

  const seen = new Set<string>();
  let cursor = parent.parentId;
  while (cursor !== null) {
    if (cursor === categoryId) {
      throw new CategoryAdminError("CYCLE", "上级分类不能是自己的下级。");
    }
    if (seen.has(cursor.toString())) break;
    seen.add(cursor.toString());
    const next = await prisma.productCategory.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }
}

export async function saveCategory(input: {
  id?: bigint;
  name: string;
  slug: string;
  sort: number;
  parentId?: bigint | null;
}): Promise<{ id: bigint }> {
  const clash = await prisma.productCategory.findFirst({
    where: { slug: input.slug, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (clash) throw new CategoryAdminError("DUPLICATE", `分类别名 ${input.slug} 已存在。`);
  await assertParentAssignable(input.id, input.parentId);

  const parentId = input.parentId ?? null;
  if (input.id) {
    const hit = await prisma.productCategory.updateMany({
      where: { id: input.id },
      data: { name: input.name, slug: input.slug, sort: input.sort, parentId },
    });
    if (hit.count === 0) throw new CategoryAdminError("NOT_FOUND", "分类不存在。");
    await writeAudit({
      category: AUDIT_CATEGORY.SHOP,
      action: AUDIT_ACTION.CATEGORY_SAVED,
      payload: { id: input.id.toString(), parentId: parentId?.toString() ?? null },
    });
    return { id: input.id };
  }
  const created = await prisma.productCategory.create({
    data: { name: input.name, slug: input.slug, sort: input.sort, parentId },
    select: { id: true },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.CATEGORY_SAVED,
    payload: { id: created.id.toString(), parentId: parentId?.toString() ?? null },
  });
  return { id: created.id };
}
