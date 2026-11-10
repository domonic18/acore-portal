import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { effectivePrice, normalizeProductImages } from "@/server/services/catalog/products";
import { nextFeaturedSort } from "@/server/services/catalog/admin/products";

/**
 * 首页精选商品管理(/admin/home):加入/移除/重排。
 * 重排按传入 id 顺序全量重写 featured_sort(规则 21 口径:子集重写会让
 * 未传行 sort 撞值、顺序静默打乱,清单与库内不一致一律拒)。
 */

export class FeaturedAdminError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NOT_PUBLISHED" | "SET_MISMATCH",
    message?: string,
  ) {
    super(message ?? `featured_admin_error: ${code}`);
    this.name = "FeaturedAdminError";
  }
}

/** 管理台列表:精选全集按展示序 */
export async function listFeaturedForAdmin() {
  const rows = await prisma.product.findMany({
    where: { featured: true },
    orderBy: [{ featuredSort: "asc" }, { id: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      price: true,
      salePrice: true,
      saleStart: true,
      saleEnd: true,
      images: true,
      status: true,
      listed: true,
      featuredSort: true,
    },
  });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id.toString(),
    slug: r.slug,
    name: r.name,
    price: effectivePrice(r, now),
    image: normalizeProductImages(r.images)[0] ?? null,
    featuredSort: r.featuredSort,
    // 非上架/目录隐藏的精选仍列出但标警示:首页查询会过滤掉它们
    offShelf: r.status !== "published" || !r.listed,
  }));
}

/** 可加入精选的候选:已上架+目录可见+尚未精选(管理台添加下拉) */
export async function listFeaturedCandidates() {
  const rows = await prisma.product.findMany({
    where: { status: "published", listed: true, featured: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, name: true, sku: true, price: true },
  });
  return rows.map((r) => ({ id: r.id.toString(), name: r.name, sku: r.sku, price: r.price }));
}

async function requireProduct(productId: bigint) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { sku: true, name: true, status: true, listed: true, featured: true },
  });
  if (!product) throw new FeaturedAdminError("NOT_FOUND", "商品不存在。");
  return product;
}

/** 加入精选:展示序追加末位 */
export async function addFeaturedProduct(productId: bigint, actorId: bigint): Promise<void> {
  const product = await requireProduct(productId);
  if (product.status !== "published" || !product.listed) {
    throw new FeaturedAdminError("NOT_PUBLISHED", "仅已上架且目录可见的商品可加入精选。");
  }
  if (product.featured) return; // 幂等:已在精选不重复追加
  const featuredSort = await nextFeaturedSort();
  await prisma.product.update({
    where: { id: productId },
    data: { featured: true, featuredSort },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED,
    actorUserId: actorId,
    payload: { productId: productId.toString(), sku: product.sku, featured: true },
  });
}

/** 移出精选:剩余精选重写为连续序,防末位空洞累积 */
export async function removeFeaturedProduct(productId: bigint, actorId: bigint): Promise<void> {
  const product = await requireProduct(productId);
  if (!product.featured) return; // 幂等
  const remaining = await prisma.product.findMany({
    where: { featured: true, id: { not: productId } },
    orderBy: [{ featuredSort: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.product.update({ where: { id: productId }, data: { featured: false } }),
    ...rewriteSorts(remaining.map((r) => r.id)),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED,
    actorUserId: actorId,
    payload: { productId: productId.toString(), sku: product.sku, featured: false },
  });
}

function rewriteSorts(orderedIds: bigint[]) {
  return orderedIds.map((id, index) =>
    prisma.product.updateMany({ where: { id }, data: { featuredSort: index } }),
  );
}

/** 重排:入参须与库内精选全集一致(全量重写,子集/多出即 422) */
export async function reorderFeaturedProducts(
  orderedIds: bigint[],
  actorId: bigint,
): Promise<void> {
  const current = await prisma.product.findMany({
    where: { featured: true },
    select: { id: true },
  });
  const currentSet = new Set(current.map((r) => r.id.toString()));
  const inputSet = new Set(orderedIds.map((id) => id.toString()));
  if (currentSet.size !== inputSet.size || [...currentSet].some((id) => !inputSet.has(id))) {
    throw new FeaturedAdminError("SET_MISMATCH", "精选清单已变化,请刷新后重试。");
  }
  await prisma.$transaction(rewriteSorts(orderedIds));
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED,
    actorUserId: actorId,
    payload: { orderedIds: orderedIds.map((id) => id.toString()) },
  });
}
