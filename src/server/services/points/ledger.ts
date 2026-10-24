import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { POINT_TX_TYPE, type PointTxTypeValue } from "@/constants/points";

/**
 * 积分账本(宪法 III:流水为真相源,余额为缓存):
 * 入账=流水+余额同事务,balance_after 快照;recalculate 供测试/对账/日终重算。
 */

type Tx = Prisma.TransactionClient;

/** 账本域错误(路由层按 code 映射响应,如 INSUFFICIENT_BALANCE → 402) */
export class LedgerError extends Error {
  constructor(public code: "INSUFFICIENT_BALANCE") {
    super(`ledger_error: ${code}`);
    this.name = "LedgerError";
  }
}

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
  const { balance } = await creditLedgerDetailed(tx, input);
  return balance;
}

/** 同 creditLedger,另回流水 id(BadgeGrant.pointTransactionId 回引用,US5) */
export async function creditLedgerDetailed(
  tx: Tx,
  input: {
    userId: bigint;
    amount: number;
    type?: PointTxTypeValue;
    remark?: string;
    refType?: string;
    refId?: bigint;
  },
): Promise<{ balance: number; transactionId: bigint }> {
  const account = await tx.pointAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, balance: input.amount },
    update: { balance: { increment: input.amount } },
  });
  const row = await tx.pointTransaction.create({
    data: {
      userId: input.userId,
      type: input.type ?? POINT_TX_TYPE.REGISTER_REWARD,
      amount: input.amount,
      balanceAfter: account.balance,
      remark: input.remark,
      refType: input.refType,
      refId: input.refId,
    },
    select: { id: true },
  });
  return { balance: account.balance, transactionId: row.id };
}

/**
 * 扣减(research R3):updateMany WHERE balance>=amount 条件更新即行锁,
 * count=0(无账户或余额不足)→ LedgerError,零写入;流水记负额。
 */
export async function debitLedger(
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
  const result = await tx.pointAccount.updateMany({
    where: { userId: input.userId, balance: { gte: input.amount } },
    data: { balance: { decrement: input.amount } },
  });
  if (result.count === 0) {
    throw new LedgerError("INSUFFICIENT_BALANCE");
  }
  const account = await tx.pointAccount.findUniqueOrThrow({
    where: { userId: input.userId },
    select: { balance: true },
  });
  await tx.pointTransaction.create({
    data: {
      userId: input.userId,
      type: input.type ?? POINT_TX_TYPE.SHOP_PAYMENT,
      amount: -input.amount,
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

/** 侧栏积分余额组件读取(M3 US1);无账户视为 0 */
export async function getBalance(userId: bigint): Promise<number> {
  const account = await prisma.pointAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return account?.balance ?? 0;
}
