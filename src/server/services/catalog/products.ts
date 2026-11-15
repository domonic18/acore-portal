import "server-only";
import { prisma } from "@/lib/db";
import { SHOP_PAGE_SIZE } from "@/constants/pagination";
import { PRODUCT_STATUS, type ProductSortValue } from "@/constants/shop";
import { paginate } from "@/lib/pagination";
import { buildProductWhere } from "@/server/services/catalog/product-query";

/**
 * 商品目录读取(前台):published+listed 过滤,一切价格以服务端
 * now() 判定生效价(FR-115),前端展示价不可信。
 * 列表在应用层排序/分页——存量规模 99 商品,SQL 窗口排序属过度设计(宪法 VII)。
 */

export type PricedProduct = {
  price: number;
  salePrice?: number | null;
  saleStart?: Date | null;
  saleEnd?: Date | null;
};

/** 生效价(FR-115):档期闭区间[saleStart, saleEnd],null 端不限 */
export function effectivePrice(p: PricedProduct, now: Date): number {
  if (p.salePrice == null) return p.price;
  if (p.saleStart && now < p.saleStart) return p.price;
  if (p.saleEnd && now > p.saleEnd) return p.price;
  return p.salePrice;
}

export function isOnSale(p: PricedProduct, now: Date): boolean {
  return p.salePrice != null && effectivePrice(p, now) === p.salePrice;
}

/** images Json 列形态收口:非数组/混入非字符串一律归一为 [],合法项 trim 去空 */
export function normalizeProductImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  type: string;
  image: string | null;
  price: number;
  effectivePrice: number;
  onSale: boolean;
  categoryName: string;
  categorySlug: string;
};

export type ProductListResult = {
  items: ProductListItem[];
  page: number;
  totalPages: number;
  total: number;
};

function parseSort(sort?: string): ProductSortValue {
  return sort === "price_asc" || sort === "price_desc" ? sort : "newest";
}

/** 列表筛选入参:分类走 DB 层,关键词/价格区间走应用层(存量规模小,与既有分页口径一致) */
export type ProductListOptions = {
  /** 分类 id 集合(含子孙;由分类树解析而来,优先于 categorySlug) */
  categoryIds?: string[];
  /** 分类 slug(精确命中) */
  categorySlug?: string;
  /** 关键词:匹配商品名与描述 */
  q?: string;
  /** 生效价下限(含) */
  minPrice?: number;
  /** 生效价上限(含) */
  maxPrice?: number;
  sort?: string;
  page?: number;
};

export async function listProducts(
  opts: ProductListOptions = {},
): Promise<ProductListResult> {
  const now = new Date();
  const rows = await prisma.product.findMany({
    where: buildProductWhere({
      categoryIds: opts.categoryIds,
      categorySlug: opts.categorySlug,
    }),
    include: { category: { select: { name: true, slug: true } } },
  });

  const enriched = rows.map((r) => ({
    id: r.id.toString(),
    slug: r.slug,
    name: r.name,
    type: r.type,
    description: r.description,
    image: normalizeProductImages(r.images)[0] ?? null,
    price: r.price,
    effectivePrice: effectivePrice(r, now),
    onSale: isOnSale(r, now),
    categoryName: r.category.name,
    categorySlug: r.category.slug,
    createdAt: r.createdAt,
  }));

  const keyword = (opts.q ?? "").trim().toLowerCase();
  const items = enriched.filter((p) => {
    if (keyword && !p.name.toLowerCase().includes(keyword) && !p.description.toLowerCase().includes(keyword)) {
      return false;
    }
    if (opts.minPrice !== undefined && p.effectivePrice < opts.minPrice) return false;
    if (opts.maxPrice !== undefined && p.effectivePrice > opts.maxPrice) return false;
    return true;
  });

  const sort = parseSort(opts.sort);
  if (sort === "price_asc") items.sort((a, b) => a.effectivePrice - b.effectivePrice);
  else if (sort === "price_desc") items.sort((a, b) => b.effectivePrice - a.effectivePrice);
  else items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = items.length;
  const totalPages = paginate(total, 1, SHOP_PAGE_SIZE).totalPages;
  const page = Math.min(Math.max(opts.page ?? 1, 1), totalPages);
  const { skip, take } = paginate(total, page, SHOP_PAGE_SIZE);
  return {
    items: items
      .slice(skip, skip + take)
      .map(({ description: _d, createdAt: _c, ...rest }) => rest),
    page,
    totalPages,
    total,
  };
}

export type ProductDetail = {
  id: string;
  sku: string;
  /** 服务类发货处理器键(服务类参数矩阵按此解析,SKU 仅为唯一标识) */
  handlerKey: string | null;
  slug: string;
  name: string;
  type: string;
  description: string;
  images: string[];
  detailMd: string | null;
  gameItemId: number | null;
  stockEnabled: boolean;
  stock: number | null;
  lowStockThreshold: number | null;
  price: number;
  salePrice: number | null;
  effectivePrice: number;
  onSale: boolean;
  listed: boolean;
  categoryName: string;
  categorySlug: string;
  categoryId: string;
};

/** 详情(draft/不存在 → null 由调用方转 404;listed=false 直链可达带标记 FR-127) */
export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  const row = await prisma.product.findUnique({
    where: { slug },
    include: { category: { select: { name: true, slug: true } } },
  });
  if (!row || row.status !== PRODUCT_STATUS.PUBLISHED) return null;
  const now = new Date();
  return {
    id: row.id.toString(),
    sku: row.sku,
    handlerKey: row.handlerKey,
    slug: row.slug,
    name: row.name,
    type: row.type,
    description: row.description,
    images: normalizeProductImages(row.images),
    detailMd: row.detailMd,
    gameItemId: row.gameItemId,
    stockEnabled: row.stockEnabled,
    stock: row.stock,
    lowStockThreshold: row.lowStockThreshold,
    price: row.price,
    salePrice: row.salePrice,
    effectivePrice: effectivePrice(row, now),
    onSale: isOnSale(row, now),
    listed: row.listed,
    categoryName: row.category.name,
    categorySlug: row.category.slug,
    categoryId: row.categoryId.toString(),
  };
}

/**
 * 商城价格区间(前台价格分面的输入框占位提示用):
 * 取 published + listed 商品的**生效价**极值;无商品时上下限均为 null。
 */
export async function getShopPriceBounds(): Promise<{ min: number | null; max: number | null }> {
  const rows = await prisma.product.findMany({
    where: { status: PRODUCT_STATUS.PUBLISHED, listed: true },
    select: { price: true, salePrice: true, saleStart: true, saleEnd: true },
  });
  if (rows.length === 0) return { min: null, max: null };
  const now = new Date();
  const prices = rows.map((r) => effectivePrice(r, now));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** 商品常见问题(FAQ)条目(前台展示) */
export type ProductFaqItem = {
  id: string;
  question: string;
  answer: string;
};

/**
 * 商品 FAQ(#159):按 sort 升序(同序按 id)返回该商品的问答。
 * 详情页用手风琴呈现,无问答时不渲染整段。
 */
export async function listProductFaqs(productId: string): Promise<ProductFaqItem[]> {
  const rows = await prisma.productFaq.findMany({
    where: { productId: BigInt(productId) },
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    select: { id: true, question: true, answer: true },
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    question: r.question,
    answer: r.answer,
  }));
}

/** 推荐位默认条数(详情页「其他商品推荐」) */
export const RELATED_PRODUCT_LIMIT = 4;

/**
 * 详情页推荐商品(#158):同分类优先、不足时用其他分类补齐。
 * 只取 published+listed(与列表页同口径),排除当前商品;
 * 排序同分类在前、其次上架时间倒序,保证结果稳定。
 */
export async function listRelatedProducts(opts: {
  categoryId: string;
  excludeId: string;
  limit?: number;
}): Promise<ProductListItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? RELATED_PRODUCT_LIMIT, 1), 12);
  const now = new Date();
  const excludeId = BigInt(opts.excludeId);
  const categoryId = BigInt(opts.categoryId);

  const rows = await prisma.product.findMany({
    where: {
      status: PRODUCT_STATUS.PUBLISHED,
      listed: true,
      id: { not: excludeId },
    },
    include: { category: { select: { name: true, slug: true } } },
  });

  const items: (ProductListItem & { createdAt: Date; categoryId: bigint })[] = rows.map((r) => ({
    id: r.id.toString(),
    slug: r.slug,
    name: r.name,
    type: r.type,
    image: normalizeProductImages(r.images)[0] ?? null,
    price: r.price,
    effectivePrice: effectivePrice(r, now),
    onSale: isOnSale(r, now),
    categoryName: r.category.name,
    categorySlug: r.category.slug,
    createdAt: r.createdAt,
    categoryId: r.categoryId,
  }));

  items.sort((a, b) => {
    const aSame = a.categoryId === categoryId ? 0 : 1;
    const bSame = b.categoryId === categoryId ? 0 : 1;
    if (aSame !== bSame) return aSame - bSame;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return items.slice(0, limit).map(({ createdAt: _c, categoryId: _cid, ...rest }) => rest);
}
