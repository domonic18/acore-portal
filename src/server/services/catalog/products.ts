import "server-only";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS, SHOP_PAGE_SIZE, type ProductSortValue } from "@/constants/shop";

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

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  type: string;
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

export async function listProducts(
  opts: { categorySlug?: string; sort?: string; page?: number } = {},
): Promise<ProductListResult> {
  const now = new Date();
  const rows = await prisma.product.findMany({
    where: {
      status: PRODUCT_STATUS.PUBLISHED,
      listed: true,
      ...(opts.categorySlug ? { category: { is: { slug: opts.categorySlug } } } : {}),
    },
    include: { category: { select: { name: true, slug: true } } },
  });

  const items: (ProductListItem & { createdAt: Date })[] = rows.map((r) => ({
    id: r.id.toString(),
    slug: r.slug,
    name: r.name,
    type: r.type,
    price: r.price,
    effectivePrice: effectivePrice(r, now),
    onSale: isOnSale(r, now),
    categoryName: r.category.name,
    categorySlug: r.category.slug,
    createdAt: r.createdAt,
  }));

  const sort = parseSort(opts.sort);
  if (sort === "price_asc") items.sort((a, b) => a.effectivePrice - b.effectivePrice);
  else if (sort === "price_desc") items.sort((a, b) => b.effectivePrice - a.effectivePrice);
  else items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE));
  const page = Math.min(Math.max(opts.page ?? 1, 1), totalPages);
  return {
    items: items.slice((page - 1) * SHOP_PAGE_SIZE, page * SHOP_PAGE_SIZE),
    page,
    totalPages,
    total,
  };
}

export type ProductDetail = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  type: string;
  description: string;
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
    slug: row.slug,
    name: row.name,
    type: row.type,
    description: row.description,
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
  };
}
