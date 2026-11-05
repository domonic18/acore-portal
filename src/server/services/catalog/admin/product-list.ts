import "server-only";
import { prisma } from "@/lib/db";
import { ADMIN_PRODUCT_PAGE_SIZE } from "@/constants/pagination";
import { paginate } from "@/lib/pagination";
import { normalizeProductImages } from "../products";

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
  const where = opts.lowStock ? { stockEnabled: true, stock: { not: null } } : {};
  // lowStock 阈值因商品而异,阈值过滤在应用层做(stock<=自身 threshold,FR-128)
  const rows = await prisma.product.findMany({
    where,
    include: { category: { select: { name: true } } },
    orderBy: { id: "desc" },
  });
  const filtered = opts.lowStock
    ? rows.filter((r) => r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1))
    : rows;
  const total = filtered.length;
  const { totalPages, skip, take } = paginate(total, page, ADMIN_PRODUCT_PAGE_SIZE);
  return {
    page,
    totalPages,
    total,
    items: filtered.slice(skip, skip + take).map(
      (r) => ({
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
        lowStock:
          r.stockEnabled && r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1),
        featured: r.featured,
        categoryName: r.category.name,
      }),
    ),
  };
}

/** 商品编辑页 DTO:BigInt/日期在 service 序列化,页面不做 ORM 适配(issue #78) */
export type AdminProductDetail = {
  id: string;
  type: string;
  sku: string;
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
  const rows = await prisma.product.findMany({
    where: { stockEnabled: true },
    select: { stock: true, lowStockThreshold: true },
  });
  return rows.filter((r) => r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1)).length;
}
