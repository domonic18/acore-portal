import "server-only";
import type { Prisma } from "@/generated/business";
import { PRODUCT_STATUS } from "@/constants/shop";

/**
 * 商品筛选的 DB 层条件构造:
 * 分类过滤下推到 SQL(product.category_id 有索引,比 JOIN 分类表再比 slug 快);
 * 关键词与价格区间留在应用层(存量 99 件,应用层过滤与现有分页口径一致)。
 */

export type ProductFilter = {
  /** 分类 id 集合(含子孙;由分类树解析而来) */
  categoryIds?: string[];
  /** 分类 slug(精确命中;与 categoryIds 二选一) */
  categorySlug?: string;
};

export function buildProductWhere(filter: ProductFilter): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    status: PRODUCT_STATUS.PUBLISHED,
    listed: true,
  };
  if (filter.categoryIds && filter.categoryIds.length > 0) {
    where.categoryId = { in: filter.categoryIds.map((id) => BigInt(id)) };
  } else if (filter.categorySlug) {
    where.category = { is: { slug: filter.categorySlug } };
  }
  return where;
}
