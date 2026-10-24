import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { listOrders } from "@/server/services/orders/queries";

/** 契约 GET /api/account/orders?page=N:200 {orders, page, totalPages};401 游客 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const url = new URL(req.url);
  const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const result = await listOrders(BigInt(session.userId), Number.isFinite(page) ? page : 1);
  return apiOk(result);
}
