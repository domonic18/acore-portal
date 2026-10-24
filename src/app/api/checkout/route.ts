import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { LedgerError } from "@/server/services/points/ledger";
import { GameDbError } from "@/server/services/shared/game-identity";
import { checkoutCart, CheckoutError } from "@/server/services/shop/checkout";
import { driveOrderDelivery } from "@/server/services/shop/delivery";

/**
 * 契约 contracts/api-shop POST /api/checkout({}):
 * 402 余额不足 / 409 超卖 / 422 空车、含下架商品或处理器前置拦截(PRECHECK_FAILED,
 * 话术随处理器);成功 {orderId, orderNo}。
 * 发货在事务外异步驱动(fire-and-forget,失败走 delivery_failed+补发,不阻塞结账响应)。
 */
export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  try {
    const result = await checkoutCart(BigInt(session.userId));
    void driveOrderDelivery(BigInt(result.orderId)).catch((err) => {
      console.error("[checkout] async delivery failed", err);
    });
    return apiOk({ orderId: result.orderId, orderNo: result.orderNo });
  } catch (err) {
    if (err instanceof LedgerError) {
      return apiError(402, err.code, "积分余额不足,请充值或调整购物车。");
    }
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    if (err instanceof CheckoutError) {
      switch (err.code) {
        case "OUT_OF_STOCK":
          return apiError(409, "OUT_OF_STOCK", "部分商品已售罄,请调整数量后重试。");
        case "PRODUCT_UNAVAILABLE":
          return apiError(422, "PRODUCT_UNAVAILABLE", "购物车中存在已下架商品,请移除后结算。");
        case "CART_EMPTY":
          return apiError(422, "CART_EMPTY", "购物车为空。");
        case "PRECHECK_FAILED":
          return apiError(422, "PRECHECK_FAILED", err.message);
      }
    }
    throw err;
  }
}
