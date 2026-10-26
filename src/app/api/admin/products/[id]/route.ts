import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { ProductAdminError, deleteProduct } from "@/server/services/catalog/admin";

/** 商品删除:零订单才可删(有订单 409 引导下架);购物车行随删+审计 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  try {
    await deleteProduct(BigInt(id), BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      if (err.code === "PRODUCT_HAS_ORDERS") return apiError(409, "PRODUCT_HAS_ORDERS", err.message);
    }
    throw err;
  }
}
