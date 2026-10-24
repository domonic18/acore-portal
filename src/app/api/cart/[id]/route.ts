import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { removeCartItem, updateCartItem } from "@/server/services/shop/cart";

/**
 * 契约 contracts/api-shop PATCH/DELETE /api/cart/[id]:
 * 仅本人行;404 不区分他人行与不存在行(防枚举);PATCH 售罄增数 409。
 */

const patchSchema = z.object({ qty: z.coerce.number().int().min(1) });

function parseId(raw: string): bigint | null {
  if (!/^\d+$/.test(raw)) return null;
  return BigInt(raw);
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const id = parseId(ctx.params.id);
  if (id === null) return apiError(404, "CART_ITEM_NOT_FOUND", "购物车项不存在。");

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.ok) return parsed.response;

  const result = await updateCartItem({
    userId: BigInt(session.userId),
    itemId: id,
    qty: parsed.data.qty,
  });
  if (!result.ok) {
    if (result.reason === "CART_ITEM_NOT_FOUND") {
      return apiError(404, "CART_ITEM_NOT_FOUND", "购物车项不存在。");
    }
    if (result.reason === "OUT_OF_STOCK") {
      return apiError(409, "OUT_OF_STOCK", "该商品已售罄,无法增加数量。");
    }
    return apiError(422, "QTY_INVALID", "数量不合法。");
  }
  return apiOk({ cartCount: result.cartCount });
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const id = parseId(ctx.params.id);
  if (id === null) return apiError(404, "CART_ITEM_NOT_FOUND", "购物车项不存在。");

  const result = await removeCartItem({ userId: BigInt(session.userId), itemId: id });
  if (!result.ok) return apiError(404, "CART_ITEM_NOT_FOUND", "购物车项不存在。");
  return apiOk({ cartCount: result.cartCount });
}
