import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { OrderAdminError, refundOrder } from "@/server/services/orders/admin";

/** 退款(FR-129):paid/delivery_failed/completed → 积分回补+库存回补+refunded+审计 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "订单不存在。");
  }
  try {
    const { balanceAfter } = await refundOrder(
      BigInt(id),
      BigInt(guard.session.userId),
      req.headers.get("x-forwarded-for"),
    );
    return apiOk({ balanceAfter });
  } catch (err) {
    if (err instanceof OrderAdminError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
}
