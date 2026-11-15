import "server-only";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS } from "@/constants/shop";
import { buildCategoryTree, type CategoryNode } from "@/lib/catalog-tree";

/**
 * 商品分类读取(前台):
 * - listCategories:平铺列表(导航等只需 slug 的调用方);
 * - listCategoryTree:父子树 + 计数(前台分面栏按子树聚合展示)。
 * 分类语义为「单分类 + 父子聚合」:商品只属一个叶子分类,父分类计数 = 子树合计。
 */

/** 分类树节点(ownCount = 自身商品数,subtreeCount = 子树合计) */
export type CategoryTreeNode = CategoryNode;

/** 分类目录(导航/筛选;按 sort 升序) */
export async function listCategories(): Promise<
  { id: string; name: string; slug: string }[]
> {
  const rows = await prisma.productCategory.findMany({
    orderBy: { sort: "asc" },
    select: { id: true, name: true, slug: true },
  });
  return rows.map((r) => ({ id: r.id.toString(), name: r.name, slug: r.slug }));
}

/**
 * 分类树(含计数):计数口径 = published + listed(草稿与下架商品不占前台分面)。
 * 未上架的分类仍会返回(ownCount = 0),由展示层决定是否剪掉
 * —— 页面要靠它区分「分类不存在」与「分类存在但无上架商品」两种空态。
 */
export async function listCategoryTree(): Promise<CategoryTreeNode[]> {
  const [categories, counts] = await Promise.all([
    prisma.productCategory.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: { id: true, name: true, slug: true, parentId: true, sort: true },
    }),
    prisma.product.groupBy({
      by: ["categoryId"],
      where: { status: PRODUCT_STATUS.PUBLISHED, listed: true },
      _count: { _all: true },
    }),
  ]);

  const countByCategory = new Map(counts.map((c) => [c.categoryId.toString(), c._count._all]));
  return buildCategoryTree(
    categories.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      slug: c.slug,
      parentId: c.parentId === null ? null : c.parentId.toString(),
      sort: c.sort,
      ownCount: countByCategory.get(c.id.toString()) ?? 0,
    })),
  );
}
