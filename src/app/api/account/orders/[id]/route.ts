import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getOrderDetail } from "@/server/services/orders/queries";

/**
 * 契约 GET /api/account/orders/{id}:200 详情;404 防枚举
 * (他人订单与不存在订单同响应;非数字 id 同 404)。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const numericId = Number(params.id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return apiError(404, "ORDER_NOT_FOUND", "订单不存在。");
  }
  const order = await getOrderDetail(BigInt(session.userId), BigInt(numericId));
  if (!order) return apiError(404, "ORDER_NOT_FOUND", "订单不存在。");
  return apiOk(order);
}
