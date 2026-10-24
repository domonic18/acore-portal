import "server-only";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS } from "@/constants/shop";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import {
  GameDbError,
  characterOwnedBy,
  resolveGameAccountId,
} from "@/server/services/shared/game-identity";
import {
  normalizeCartParams,
  validateCartParams,
  type CartParams,
  type ValidatedCartParams,
} from "@/server/services/shop/param-schemas";
import { effectivePrice, isOnSale } from "@/server/services/catalog/products";

/**
 * 购物车(research R6 DB 行模型,无唯一约束):
 * 加购校验链 contracts/api-shop——published→参数矩阵→角色归属(审计)→售罄;
 * 同商品同参数合并为应用层行为;行归属校验 404 防枚举。
 */

export type CartMutationResult =
  | { ok: true; cartCount: number }
  | {
      ok: false;
      reason:
        | "PRODUCT_NOT_FOUND"
        | "NOT_PUBLISHED"
        | "PARAM_INVALID"
        | "NO_HANDLER"
        | "CHARACTER_NOT_OWNED"
        | "OUT_OF_STOCK"
        | "CART_ITEM_NOT_FOUND"
        | "QTY_INVALID";
    };

async function cartCount(userId: bigint): Promise<number> {
  return prisma.cartItem.count({ where: { userId } });
}

export async function addToCart(input: {
  userId: bigint;
  productId: bigint;
  qty?: number;
  params?: unknown;
}): Promise<CartMutationResult> {
  const qty = input.qty ?? 1;
  if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: "QTY_INVALID" };

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) return { ok: false, reason: "PRODUCT_NOT_FOUND" };
  if (product.status !== PRODUCT_STATUS.PUBLISHED) {
    return { ok: false, reason: "NOT_PUBLISHED" };
  }

  const validated = validateCartParams(product.sku, input.params);
  if (!validated.ok) return validated;

  // 角色归属(参数矩阵所有 SKU 均含 characterGuid):越权即审计(FR-120)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: input.userId },
    select: { username: true },
  });
  const accountId = await resolveGameAccountId(user.username);
  const owned =
    accountId !== null &&
    (await characterOwnedBy(accountId, validated.params.characterGuid));
  if (!owned) {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.OWNERSHIP_VIOLATION,
      actorUserId: input.userId,
      payload: { scope: "cart_add", sku: product.sku, characterGuid: validated.params.characterGuid },
    });
    return { ok: false, reason: "CHARACTER_NOT_OWNED" };
  }

  if (product.stockEnabled && (product.stock ?? 0) <= 0) {
    return { ok: false, reason: "OUT_OF_STOCK" };
  }

  const paramsKey = normalizeCartParams(validated.params);
  const rows = await prisma.cartItem.findMany({
    where: { userId: input.userId, productId: input.productId },
  });
  const twin = rows.find((r) => normalizeCartParams(r.params as CartParams) === paramsKey);
  if (twin) {
    await prisma.cartItem.update({ where: { id: twin.id }, data: { qty: { increment: qty } } });
    return { ok: true, cartCount: rows.length };
  }
  await prisma.cartItem.create({
    data: {
      userId: input.userId,
      productId: input.productId,
      qty,
      params: validated.params,
    },
  });
  return { ok: true, cartCount: rows.length + 1 };
}

export async function updateCartItem(input: {
  userId: bigint;
  itemId: bigint;
  qty: number;
}): Promise<CartMutationResult> {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    return { ok: false, reason: "QTY_INVALID" };
  }
  const row = await prisma.cartItem.findFirst({
    where: { id: input.itemId, userId: input.userId },
    include: { product: { select: { stockEnabled: true, stock: true } } },
  });
  if (!row) return { ok: false, reason: "CART_ITEM_NOT_FOUND" };
  // 售罄(推导态 stock<=0)时禁止增数,减数放行(契约 PATCH 语义)
  const soldOut = row.product.stockEnabled && (row.product.stock ?? 0) <= 0;
  if (soldOut && input.qty > row.qty) return { ok: false, reason: "OUT_OF_STOCK" };
  await prisma.cartItem.update({ where: { id: row.id }, data: { qty: input.qty } });
  return { ok: true, cartCount: await cartCount(input.userId) };
}

export async function removeCartItem(input: {
  userId: bigint;
  itemId: bigint;
}): Promise<CartMutationResult> {
  // deleteMany 带归属条件:他人行与不存在行同响应(防枚举)
  const deleted = await prisma.cartItem.deleteMany({
    where: { id: input.itemId, userId: input.userId },
  });
  if (deleted.count === 0) return { ok: false, reason: "CART_ITEM_NOT_FOUND" };
  return { ok: true, cartCount: await cartCount(input.userId) };
}

export type CartLine = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  unitPrice: number;
  onSale: boolean;
  qty: number;
  subtotal: number;
  params: ValidatedCartParams;
  soldOut: boolean;
  published: boolean;
};

/** 购物车视图(行参数复核/小计;售罄与下架标记可见但不可结,结账层拦截) */
export async function getCartLines(userId: bigint): Promise<CartLine[]> {
  const now = new Date();
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          sku: true,
          status: true,
          price: true,
          salePrice: true,
          saleStart: true,
          saleEnd: true,
          stockEnabled: true,
          stock: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const p = r.product;
    const unitPrice = effectivePrice(p, now);
    return {
      id: r.id.toString(),
      productId: p.id.toString(),
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      unitPrice,
      onSale: isOnSale(p, now),
      qty: r.qty,
      subtotal: unitPrice * r.qty,
      params: r.params as ValidatedCartParams,
      soldOut: p.stockEnabled && (p.stock ?? 0) <= 0,
      published: p.status === PRODUCT_STATUS.PUBLISHED,
    };
  });
}
