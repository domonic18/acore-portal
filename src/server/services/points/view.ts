import "server-only";
import { prisma } from "@/lib/db";

/** 积分页与 /api/account/points 共用取数(余额 + 流水分页) */
export const POINTS_PAGE_SIZE = 10;

export type PointTxRow = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  remark: string | null;
  createdAt: string;
};

export type PointsPageData = {
  /** null = 账本不可得,视图走错误态,不伪造 0 */
  balance: number | null;
  page: number;
  totalPages: number;
  transactions: PointTxRow[];
};

export async function getPointBalance(userId: bigint): Promise<number | null> {
  const account = await prisma.pointAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return account?.balance ?? null;
}

export async function getPointsPage(
  userId: bigint,
  rawPage = 1,
  pageSize = POINTS_PAGE_SIZE,
): Promise<PointsPageData> {
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const balance = await getPointBalance(userId);
  if (balance === null) return { balance: null, page, totalPages: 1, transactions: [] };

  const [total, rows] = await Promise.all([
    prisma.pointTransaction.count({ where: { userId } }),
    prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        remark: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    balance,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    transactions: rows.map((t) => ({
      id: t.id.toString(),
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      remark: t.remark,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
