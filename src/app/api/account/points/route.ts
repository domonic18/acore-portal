import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 10;

/** 契约:200 {balance, transactions, page, totalPages};余额不可得时走错误态,不伪造 0 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const userId = BigInt(session.userId);

  const url = new URL(req.url);
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  const account = await prisma.pointAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });
  if (!account) {
    return apiError(503, "LEDGER_UNAVAILABLE", "积分数据暂不可用,请稍后重试。");
  }

  const total = await prisma.pointTransaction.count({ where: { userId } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const transactions = await prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      type: true,
      amount: true,
      balanceAfter: true,
      remark: true,
      createdAt: true,
    },
  });

  return apiOk({
    balance: account.balance,
    transactions: transactions.map((t) => ({
      id: t.id.toString(),
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      remark: t.remark,
      createdAt: t.createdAt.toISOString(),
    })),
    page,
    totalPages,
  });
}
