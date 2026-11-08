import "server-only";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { ADMIN_PRODUCT_PAGE_SIZE } from "@/constants/pagination";
import { pageSlice, totalPageCount } from "@/lib/pagination";
import { normalizeProductImages } from "../products";

/** 商品行(带分类名):列表页与编辑页共用同一形状 */
type AdminProductRow = Prisma.ProductGetPayload<{
  include: { category: { select: { name: true } } };
}>;

export type AdminProductListItem = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  type: string;
  image: string | null;
  status: string;
  listed: boolean;
  price: number;
  salePrice: number | null;
  stockEnabled: boolean;
  stock: number | null;
  lowStockThreshold: number | null;
  lowStock: boolean;
  featured: boolean;
  categoryName: string;
};

function toListItem(r: AdminProductRow): AdminProductListItem {
  return {
    id: r.id.toString(),
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    type: r.type,
    image: normalizeProductImages(r.images)[0] ?? null,
    status: r.status,
    listed: r.listed,
    price: r.price,
    salePrice: r.salePrice,
    stockEnabled: r.stockEnabled,
    stock: r.stock,
    lowStockThreshold: r.lowStockThreshold,
    lowStock: r.stockEnabled && r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1),
    featured: r.featured,
    categoryName: r.category.name,
  };
}

/**
 * 低库存商品 id 集合(降序)。
 * 判定是「本行 stock ≤ 本行 low_stock_threshold」(列比列,FR-128),
 * Prisma where 表达不了 → 只取三列在应用层过滤,再按 id 取当页行,
 * 避免把整张商品表连分类 JOIN 全量拉回。
 */
async function lowStockProductIds(): Promise<bigint[]> {
  const rows = await prisma.product.findMany({
    where: { stockEnabled: true, stock: { not: null } },
    orderBy: { id: "desc" },
    select: { id: true, stock: true, lowStockThreshold: true },
  });
  return rows
    .filter((r) => r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1))
    .map((r) => r.id);
}

export async function listAdminProducts(opts: {
  lowStock?: boolean;
  page?: number;
}): Promise<{
  items: AdminProductListItem[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const { skip, take } = pageSlice(page, ADMIN_PRODUCT_PAGE_SIZE);
  const select = { category: { select: { name: true } } } as const;

  let total: number;
  let rows: AdminProductRow[];
  if (opts.lowStock) {
    const ids = await lowStockProductIds();
    total = ids.length;
    const pageIds = ids.slice(skip, skip + take);
    rows =
      pageIds.length === 0
        ? []
        : await prisma.product.findMany({
            where: { id: { in: pageIds } },
            include: select,
            orderBy: { id: "desc" },
          });
  } else {
    const [count, pageRows] = await Promise.all([
      prisma.product.count(),
      prisma.product.findMany({
        include: select,
        orderBy: { id: "desc" },
        skip,
        take,
      }),
    ]);
    total = count;
    rows = pageRows;
  }

  return {
    page,
    totalPages: totalPageCount(total, ADMIN_PRODUCT_PAGE_SIZE),
    total,
    items: rows.map(toListItem),
  };
}

/** 商品编辑页 DTO:BigInt/日期在 service 序列化,页面不做 ORM 适配(issue #78) */
export type AdminProductDetail = {
  id: string;
  type: string;
  sku: string;
  /** 服务类发货处理器键 */
  handlerKey: string | null;
  slug: string;
  name: string;
  description: string;
  images: string[];
  detailMd: string;
  categoryId: string;
  categoryName: string;
  price: number;
  salePrice: number | null;
  saleStart: string | null;
  saleEnd: string | null;
  stockEnabled: boolean;
  stock: number | null;
  lowStockThreshold: number | null;
  maxPerUser: number | null;
  gameItemId: number | null;
  status: string;
  listed: boolean;
  featured: boolean;
};

export async function getAdminProduct(id: bigint): Promise<AdminProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!product) return null;
  return {
    id: product.id.toString(),
    type: product.type,
    sku: product.sku,
    handlerKey: product.handlerKey,
    slug: product.slug,
    name: product.name,
    description: product.description,
    images: normalizeProductImages(product.images),
    detailMd: product.detailMd ?? "",
    categoryId: product.category.id.toString(),
    categoryName: product.category.name,
    price: product.price,
    salePrice: product.salePrice,
    saleStart: product.saleStart?.toISOString() ?? null,
    saleEnd: product.saleEnd?.toISOString() ?? null,
    stockEnabled: product.stockEnabled,
    stock: product.stock,
    lowStockThreshold: product.lowStockThreshold,
    maxPerUser: product.maxPerUser,
    gameItemId: product.gameItemId,
    status: product.status,
    listed: product.listed,
    featured: product.featured,
  };
}

export async function countLowStockProducts(): Promise<number> {
  return (await lowStockProductIds()).length;
}
