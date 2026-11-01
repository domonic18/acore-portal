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
        categoryName: r.category.name,
      }),
    ),
  };
}

export async function getAdminProduct(id: bigint) {
  return prisma.product.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });
}

export async function countLowStockProducts(): Promise<number> {
  const rows = await prisma.product.findMany({
    where: { stockEnabled: true },
    select: { stock: true, lowStockThreshold: true },
  });
  return rows.filter((r) => r.stock !== null && r.stock <= (r.lowStockThreshold ?? 1)).length;
}
