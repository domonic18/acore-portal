import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { prisma } from "@/lib/db";
import { GameDbError } from "@/server/services/shared/game-identity";
import { addToCart } from "@/server/services/shop/cart";

/**
 * 契约 contracts/api-shop POST /api/cart:
 * 校验链 published→参数矩阵(422)→角色归属(403+审计)→售罄(409)→同参数合并行。
 * 不存在与未发布同响应 404(不泄露 draft 存在性)。
 */

const bodySchema = z.object({
  productId: z.coerce.number().int().positive(),
  qty: z.coerce.number().int().min(1).optional(),
  params: z.unknown().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await addToCart({
      userId: BigInt(session.userId),
      productId: BigInt(parsed.data.productId),
      qty: parsed.data.qty,
      params: parsed.data.params,
    });
    if (!result.ok) {
      switch (result.reason) {
        case "PRODUCT_NOT_FOUND":
        case "NOT_PUBLISHED":
          return apiError(404, "PRODUCT_NOT_FOUND", "商品不存在或已下架。");
        case "PARAM_INVALID":
        case "NO_HANDLER":
          return apiError(422, "PARAM_INVALID", "商品参数不完整或有误,请重新选择。");
        case "QTY_INVALID":
          return apiError(422, "QTY_INVALID", "数量不合法。");
        case "CHARACTER_NOT_OWNED":
          return apiError(403, "CHARACTER_NOT_OWNED", "所选角色不属于当前账号。");
        case "OUT_OF_STOCK":
          return apiError(409, "OUT_OF_STOCK", "该商品已售罄。");
        case "PURCHASE_LIMIT_EXCEEDED":
          return apiError(409, "PURCHASE_LIMIT_EXCEEDED", "已达到该商品的每人限购数量。");
        default:
          return apiError(404, "CART_ITEM_NOT_FOUND", "购物车项不存在。");
      }
    }
    return apiOk({ cartCount: result.cartCount });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
