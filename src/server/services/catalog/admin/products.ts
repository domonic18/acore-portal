import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import type { ProductStatusValue } from "@/constants/shop";
import { getGameItem } from "../game-items";
import { validateSkuBinding } from "@/constants/shop-sku";
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
  /** 服务类发货处理器键(注册表内的 6 个键);物品类为 null */
  handlerKey?: string | null;
  status: ProductStatusValue;
  listed: boolean;
  featured?: boolean;
};

export async function saveProduct(input: ProductSaveInput): Promise<{ id: bigint }> {
  // 物品类先查 world 物品模板:既要确认存在,也要拿可堆叠性(stackable)校验 _stack 后缀
  const gameItem =
    input.type === "game_item" && input.gameItemId != null
      ? await getGameItem(input.gameItemId)
      : null;

  // SKU 契约先于其余校验(纯函数,避免为明显的 SKU 错误白跑一次 world 查询)
  const binding = validateSkuBinding({
    type: input.type,
    sku: input.sku,
    gameItemId: input.gameItemId ?? null,
    handlerKey: input.handlerKey ?? null,
    stackable: gameItem?.stackable ?? null,
  });
  if (binding) {
    throw new ProductAdminError(binding.code, binding.message, binding.field);
  }

  if (input.type === "game_item") {
    if (input.gameItemId == null || !gameItem) {
      throw new ProductAdminError(
        "SKU_GAME_ITEM_NOT_FOUND",
        `游戏物品 #${input.gameItemId ?? "?"} 不存在,请核对物品 ID。`,
        "gameItemId",
      );
    }
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
    // 服务类恒限购 1 件(单次购买一次;发货完成后释放额度,可再次购买)
    maxPerUser: input.type === "service" ? 1 : (input.maxPerUser ?? null),
    gameItemId: input.type === "game_item" ? (input.gameItemId ?? null) : null,
    handlerKey: input.type === "service" ? (input.handlerKey ?? null) : null,
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
