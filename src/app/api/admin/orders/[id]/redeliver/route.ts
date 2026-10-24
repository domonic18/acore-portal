import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { OrderAdminError, redeliverOrder } from "@/server/services/orders/admin";

/** 人工补发(FR-129):仅 delivery_failed;幂等键=order_item.id,重复补发不重复发货 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "订单不存在。");
  }
  try {
    const { items } = await redeliverOrder(
      BigInt(id),
      BigInt(guard.session.userId),
      req.headers.get("x-forwarded-for"),
    );
    return apiOk({
      results: items.map((i) => ({ orderItemId: i.id, deliveryStatus: i.deliveryStatus })),
    });
  } catch (err) {
    if (err instanceof OrderAdminError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
}
