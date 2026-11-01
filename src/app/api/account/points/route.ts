import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getPointsPage } from "@/server/services/points/view";

/** 契约:200 {balance, transactions, page, totalPages};余额不可得时走错误态,不伪造 0 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const url = new URL(req.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const data = await getPointsPage(BigInt(session.userId), rawPage);
  if (data.balance === null) {
    return apiError(503, "LEDGER_UNAVAILABLE", "积分数据暂不可用,请稍后重试。");
  }

  return apiOk({
    balance: data.balance,
    transactions: data.transactions,
    page: data.page,
    totalPages: data.totalPages,
  });
}
