import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { POINT_TX_TYPE, type PointTxTypeValue } from "@/constants/points";

/**
 * 积分账本(宪法 III:流水为真相源,余额为缓存):
 * 入账=流水+余额同事务,balance_after 快照;recalculate 供测试/对账/日终重算。
 */

type Tx = Prisma.TransactionClient;

export async function creditLedger(
  tx: Tx,
  input: {
    userId: bigint;
    amount: number;
    type?: PointTxTypeValue;
    remark?: string;
    refType?: string;
    refId?: bigint;
  },
): Promise<number> {
  const account = await tx.pointAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, balance: input.amount },
    update: { balance: { increment: input.amount } },
  });
  await tx.pointTransaction.create({
    data: {
      userId: input.userId,
      type: input.type ?? POINT_TX_TYPE.REGISTER_REWARD,
      amount: input.amount,
      balanceAfter: account.balance,
      remark: input.remark,
      refType: input.refType,
      refId: input.refId,
    },
  });
  return account.balance;
}

/** SUM(流水) 覆盖余额;返回重算结果供断言 */
export async function recalculateLedger(
  userId: bigint,
): Promise<{ balance: number; sum: number }> {
  const agg = await prisma.pointTransaction.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  const sum = agg._sum.amount ?? 0;
  await prisma.pointAccount.upsert({
    where: { userId },
    create: { userId, balance: sum },
    update: { balance: sum },
  });
  return { balance: sum, sum };
}
