import "server-only";
import { prisma } from "@/lib/db";

export type ReconcileDiff = { userId: bigint; stored: number; computed: number };

/**
 * 全量对账(FR-106/宪法 III):余额是缓存,SUM(流水) 才是真相。
 * 双查询找差异——①有户但 balance≠SUM ②有流水无户(孤儿);
 * 只报告不修复,修复走 recalculateLedger(管理员确认后执行)。
 */
export async function reconcileAllPoints(): Promise<{
  checked: number;
  diffs: ReconcileDiff[];
}> {
  const accounts = await prisma.pointAccount.findMany({
    select: { userId: true, balance: true },
  });
  const sums = await prisma.pointTransaction.groupBy({
    by: ["userId"],
    _sum: { amount: true },
  });

  const sumMap = new Map<bigint, number>(
    sums.map((s) => [s.userId, s._sum.amount ?? 0]),
  );
  const accountIds = new Set(accounts.map((a) => a.userId));

  const diffs: ReconcileDiff[] = [];
  for (const acc of accounts) {
    const computed = sumMap.get(acc.userId) ?? 0;
    if (acc.balance !== computed) {
      diffs.push({ userId: acc.userId, stored: acc.balance, computed });
    }
  }
  for (const s of sums) {
    if (!accountIds.has(s.userId)) {
      diffs.push({ userId: s.userId, stored: 0, computed: s._sum.amount ?? 0 });
    }
  }
  return { checked: accounts.length, diffs };
}
