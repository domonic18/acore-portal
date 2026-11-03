import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import type { ProductStatusValue } from "@/constants/shop";
import { gameItemExists } from "../sku-check";
import { resolveHandler } from "@/server/services/shop/handlers/registry";
import { ProductAdminError } from "./shared";

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
  featured?: boolean;
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
    featured: input.featured ?? false,
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

export type ProductQuickEditInput = {
  price?: number;
  salePrice?: number | null;
  stockEnabled?: boolean;
  stock?: number | null;
  status?: ProductStatusValue;
  listed?: boolean;
  featured?: boolean;
};

/**
 * 商品列表快速编辑(用户反馈 2026-11-03,对标 WP 快速编辑):
 * 仅部分高频字段(价格/库存/状态/显隐/精选),不碰 sku/slug/categoryId;
 * 校验合并现值(促销价<原价按合并后判定);服务类禁库存字段;
 * 审计只记字段名与 sku,不记字段值(与后台审计脱敏口径一致)。
 */
export async function updateProductQuickEdit(
  id: bigint,
  input: ProductQuickEditInput,
  actorId: bigint,
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      sku: true,
      type: true,
      price: true,
      salePrice: true,
      stockEnabled: true,
      stock: true,
    },
  });
  if (!product) throw new ProductAdminError("NOT_FOUND", "商品不存在。");

  if (product.type !== "game_item" && (input.stockEnabled !== undefined || input.stock !== undefined)) {
    throw new ProductAdminError("STOCK_NOT_APPLICABLE", "服务类商品不使用库存字段。");
  }

  const price = input.price ?? product.price;
  const salePrice = input.salePrice !== undefined ? input.salePrice : product.salePrice;
  if (salePrice != null && salePrice >= price) {
    throw new ProductAdminError("SALE_PRICE_INVALID", "促销价必须低于原价。");
  }

  const stockEnabled = input.stockEnabled ?? product.stockEnabled;
  const data = {
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
    ...(input.stockEnabled !== undefined || input.stock !== undefined
      ? { stockEnabled, stock: stockEnabled ? (input.stock ?? product.stock ?? 0) : null }
      : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.listed !== undefined ? { listed: input.listed } : {}),
    ...(input.featured !== undefined ? { featured: input.featured } : {}),
  };

  const hit = await prisma.product.updateMany({ where: { id }, data });
  if (hit.count === 0) throw new ProductAdminError("NOT_FOUND", "商品不存在。");

  await writeAudit({
    category: AUDIT_CATEGORY.SHOP,
    action: AUDIT_ACTION.PRODUCT_QUICK_EDITED,
    actorUserId: actorId,
    payload: { productId: id.toString(), sku: product.sku, fields: Object.keys(data) },
  });
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
