import "server-only";
import { prisma } from "@/lib/db";
import {
  ADJUST_REASON_MAX,
  ADJUST_REASON_MIN,
  POINT_TX_TYPE,
} from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { creditLedger, debitLedger, LedgerError } from "@/server/services/points/ledger";

export type AdjustOutcome =
  | { ok: true; balanceAfter: number }
  | { ok: false; reason: "reason_invalid" | "amount_invalid" | "insufficient_balance" };

/**
 * 后台积分手调(FR-105):正额入账/负额扣减,原因 2-255 必填,
 * 流水 refType='admin' refId=操作者;审计含调整前后余额(宪法 VI 记事件不记敏感值,
 * 原因为管理员输入的业务说明,随审计留痕)。
 */
export async function adjustPoints(input: {
  userId: bigint;
  amount: number;
  reason: string;
  operatorId: bigint;
  ip?: string | null;
}): Promise<AdjustOutcome> {
  const reason = input.reason.trim();
  if (reason.length < ADJUST_REASON_MIN || reason.length > ADJUST_REASON_MAX) {
    return { ok: false, reason: "reason_invalid" };
  }
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    return { ok: false, reason: "amount_invalid" };
  }

  try {
    const balanceAfter = await prisma.$transaction(async (tx) => {
      const before =
        (
          await tx.pointAccount.findUnique({
            where: { userId: input.userId },
            select: { balance: true },
          })
        )?.balance ?? 0;
      const ledgerInput = {
        userId: input.userId,
        type: POINT_TX_TYPE.MANUAL_ADJUST,
        remark: reason,
        refType: "admin",
        refId: input.operatorId,
      };
      const balance =
        input.amount > 0
          ? await creditLedger(tx, { ...ledgerInput, amount: input.amount })
          : await debitLedger(tx, { ...ledgerInput, amount: -input.amount });
      await writeAudit({
        category: AUDIT_CATEGORY.POINTS,
        action: AUDIT_ACTION.POINTS_ADJUST,
        actorUserId: input.operatorId,
        payload: {
          userId: String(input.userId),
          before,
          after: balance,
          delta: input.amount,
          reason,
        },
        ip: input.ip,
      });
      return balance;
    });
    return { ok: true, balanceAfter };
  } catch (err) {
    if (err instanceof LedgerError && err.code === "INSUFFICIENT_BALANCE") {
      return { ok: false, reason: "insufficient_balance" };
    }
    throw err;
  }
}
