import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { adjustPoints } from "@/server/services/points/adjust";

const schema = z.object({
  amount: z.number().int().refine((v) => v !== 0, "金额不能为 0"),
  reason: z.string().trim().min(2).max(255),
});

/** 积分手调(FR-105/FR-130):manual_adjust 流水+审计;禁止负余额 → 402 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const userId = Number(params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return apiError(404, "NOT_FOUND", "用户不存在。");
  }
  const outcome = await adjustPoints({
    userId: BigInt(userId),
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    operatorId: BigInt(guard.session.userId),
    ip: req.headers.get("x-forwarded-for"),
  });
  if (!outcome.ok) {
    if (outcome.reason === "insufficient_balance") {
      return apiError(402, "INSUFFICIENT_BALANCE", "余额不足,禁止调至负数。");
    }
    return apiError(422, "PARAM_INVALID", "调整金额或原因不合法。");
  }
  return apiOk({ balance: outcome.balanceAfter });
}
