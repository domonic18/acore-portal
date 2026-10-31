import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { PRODUCT_STATUS, type ProductStatusValue } from "@/constants/shop";
import { gameItemExists } from "./sku-check";
import { normalizeProductImages } from "./products";
import { resolveHandler } from "@/server/services/shop/handlers/registry";

/**
 * 后台商品/分类管理(api-admin 契约,FR-126~128):
 * SKU 保存校验——game_item ⇒ gameItemId 在 world 存在(库不可达 GameDbError 上抛,
 * 路由层 503 拒绝保存不放行);service ⇒ sku 命中处理器注册表;促销价 < 原价;
 * sku/slug 唯一。上下架/目录隐藏不影响历史订单行快照;低库存=推导查询(R3)。
 */

export class ProductAdminError extends Error {
  constructor(
    public code:
      | "SKU_GAME_ITEM_NOT_FOUND"
      | "SKU_HANDLER_UNBOUND"
      | "SALE_PRICE_INVALID"
      | "DUPLICATE"
      | "CATEGORY_NOT_FOUND"
      | "PRODUCT_HAS_ORDERS"
      | "DUPLICATE_UNSUPPORTED"
      | "NOT_FOUND",
    message?: string,
  ) {
    super(message ?? `product_admin_error: ${code}`);
    this.name = "ProductAdminError";
  }
}

export type ProductSaveInput = {
  id?: bigint;
  type: "game_item" | "service";
  sku: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  detailMd: string | null;
  categoryId: bigint;
  price: number;
  salePrice?: number | null;
  saleStart?: Date | null;
  saleEnd?: Date | null;
  stockEnabled: boolean;
  stock?: number | null;
  lowStockThreshold?: number | null;
  maxPerUser?: number | null;
  gameItemId?: number | null;
  status: ProductStatusValue;
  listed: boolean;
};

export async function saveProduct(input: ProductSaveInput): Promise<{ id: bigint }> {
  if (input.type === "game_item") {
    if (input.gameItemId == null || !(await gameItemExists(input.gameItemId))) {
      throw new ProductAdminError(
        "SKU_GAME_ITEM_NOT_FOUND",
        `游戏物品 #${input.gameItemId ?? "?"} 不存在,请核对物品 ID。`,
      );
    }
  } else if (resolveHandler(input.sku) === null) {
    throw new ProductAdminError(
      "SKU_HANDLER_UNBOUND",
      "服务类 SKU 未绑定处理器,请使用注册表内的服务键。",
    );
  }

  if (input.salePrice != null && input.salePrice >= input.price) {
    throw new ProductAdminError("SALE_PRICE_INVALID", "促销价必须低于原价。");
  }

  const category = await prisma.productCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true },
  });
  if (!category) throw new ProductAdminError("CATEGORY_NOT_FOUND", "分类不存在。");

  const clash = await prisma.product.findFirst({
    where: {
      OR: [{ sku: input.sku }, { slug: input.slug }],
      ...(input.id ? { id: { not: input.id } } : {}),
    },
    select: { sku: true, slug: true, id: true },
  });
  if (clash) {
    throw new ProductAdminError(
      "DUPLICATE",
      clash.sku === input.sku ? `SKU ${input.sku} 已存在。` : `别名 ${input.slug} 已存在。`,
    );
  }

  const data = {
    type: input.type,
    sku: input.sku,
    name: input.name,
    slug: input.slug,
    description: input.description,
    images: input.images,
    detailMd: input.detailMd,
    categoryId: input.categoryId,
    status: input.status,
    listed: input.listed,
    price: input.price,
    salePrice: input.salePrice ?? null,
    saleStart: input.saleStart ?? null,
    saleEnd: input.saleEnd ?? null,
    stockEnabled: input.stockEnabled,
    stock: input.stockEnabled ? (input.stock ?? 0) : null,
    lowStockThreshold: input.lowStockThreshold ?? null,
    maxPerUser: input.maxPerUser ?? null,
    gameItemId: input.type === "game_item" ? (input.gameItemId ?? null) : null,
  };
  if (input.id) {
    const hit = await prisma.product.updateMany({ where: { id: input.id }, data });
    if (hit.count === 0) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
    return { id: input.id };
  }
  const created = await prisma.product.create({ data, select: { id: true } });
  return { id: created.id };
}

export async function setProductStatus(
  id: bigint,
  status: ProductStatusValue,
  listed?: boolean,
): Promise<void> {
  const hit = await prisma.product.updateMany({
    where: { id },
    data: { status, ...(listed === undefined ? {} : { listed }) },
  });
  if (hit.count === 0) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
}

/**
 * 删除商品:仅限零订单(订单行是账务快照,不可灭失→有单走下架);
 * 购物车行是瞬态购物状态,事务内随删避免挂死链;审计落 sku/name 便于追溯。
 */
export async function deleteProduct(id: bigint, actorId: bigint): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { sku: true, name: true, legacyWpProductId: true },
  });
  if (!product) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
  const orderCount = await prisma.orderItem.count({ where: { productId: id } });
  if (orderCount > 0) {
    throw new ProductAdminError(
      "PRODUCT_HAS_ORDERS",
      `该商品已有 ${orderCount} 条订单记录,不可删除;请改用「下架」隐藏。`,
    );
  }
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { productId: id } }),
    prisma.product.delete({ where: { id } }),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_DELETED,
    actorUserId: actorId,
    payload: {
      productId: id.toString(),
      sku: product.sku,
      name: product.name,
      ...(product.legacyWpProductId == null
        ? {}
        : { legacyWpProductId: product.legacyWpProductId }),
    },
  });
}

// ===== 批量操作与复制(二期商城增强) =====

export type ProductBatchAction = "publish" | "draft" | "list" | "unlist";

const BATCH_ACTION_DATA: Record<
  ProductBatchAction,
  { status?: ProductStatusValue; listed?: boolean }
> = {
  publish: { status: PRODUCT_STATUS.PUBLISHED },
  draft: { status: PRODUCT_STATUS.DRAFT },
  list: { listed: true },
  unlist: { listed: false },
};

/** 批量上下架/目录显隐(不含删除:删除有订单安全与逐行审计语义,保持逐行) */
export async function batchSetProducts(
  ids: bigint[],
  action: ProductBatchAction,
  actorId: bigint,
): Promise<{ updated: number }> {
  if (ids.length === 0) return { updated: 0 };
  const result = await prisma.product.updateMany({
    where: { id: { in: ids } },
    data: BATCH_ACTION_DATA[action],
  });
  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_BATCH_UPDATED,
    actorUserId: actorId,
    payload: { action, count: result.count, ids: ids.map((id) => id.toString()) },
  });
  return { updated: result.count };
}

function appendSuffix(base: string, suffix: string, max: number): string {
  return base.length + suffix.length <= max
    ? `${base}${suffix}`
    : `${base.slice(0, max - suffix.length)}${suffix}`;
}

/**
 * 复制商品:仅服务类可复制——物品类 SKU=itemsend_{游戏物品ID} 是商城与游戏世界的
 * 唯一映射契约(宪法铁律③),同一物品不能对应两个 SKU。
 * 副本重置为安全初值(草稿、无促销、无库存),sku/slug 追加 -copy 序号避让。
 */
export async function duplicateProduct(
  id: bigint,
  actorId: bigint,
): Promise<{ id: bigint }> {
  const source = await prisma.product.findUnique({ where: { id } });
  if (!source) throw new ProductAdminError("NOT_FOUND", "商品不存在。");
  if (source.type === "game_item") {
    throw new ProductAdminError(
      "DUPLICATE_UNSUPPORTED",
      "物品类商品不可复制:同一游戏物品只能映射一个 itemsend_{id} SKU。",
    );
  }

  let attempt = 1;
  for (;;) {
    const suffix = attempt === 1 ? "-copy" : `-copy-${attempt}`;
    const sku = appendSuffix(source.sku, suffix, 64);
    const slug = appendSuffix(source.slug, suffix, 128);
    const clash = await prisma.product.findFirst({
      where: { OR: [{ sku }, { slug }] },
      select: { id: true },
    });
    if (!clash) {
      const created = await prisma.product.create({
        data: {
          type: source.type,
          sku,
          slug,
          name: `${source.name}(副本)`.slice(0, 128),
          description: source.description,
          ...(source.images === null
            ? {}
            : { images: normalizeProductImages(source.images) }),
          detailMd: source.detailMd,
          categoryId: source.categoryId,
          status: PRODUCT_STATUS.DRAFT,
          listed: true,
          price: source.price,
          salePrice: null,
          saleStart: null,
          saleEnd: null,
          stockEnabled: false,
          stock: null,
          lowStockThreshold: source.lowStockThreshold,
          maxPerUser: source.maxPerUser,
          gameItemId: null,
          featured: false,
        },
        select: { id: true },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SHOP,
        action: AUDIT_ACTION.PRODUCT_DUPLICATED,
        actorUserId: actorId,
        payload: {
          sourceId: id.toString(),
          targetId: created.id.toString(),
          sku,
        },
      });
      return { id: created.id };
    }
    attempt += 1;
  }
}

export const ADMIN_PRODUCT_PAGE_SIZE = 20;

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
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_PRODUCT_PAGE_SIZE));
  return {
    page,
    totalPages,
    total,
    items: filtered.slice((page - 1) * ADMIN_PRODUCT_PAGE_SIZE, page * ADMIN_PRODUCT_PAGE_SIZE).map(
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
