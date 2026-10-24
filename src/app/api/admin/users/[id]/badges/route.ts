import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { grantBadge } from "@/server/services/users-admin/admin";

const schema = z.object({
  badgeId: z.coerce.number().int().positive(),
});

/** 徽章授予(FR-104/FR-130):badge_grant+badge_reward 流水(读 point_rule);重复 409 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const userId = Number(params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return apiError(404, "NOT_FOUND", "用户不存在。");
  }
  const outcome = await grantBadge({
    userId: BigInt(userId),
    badgeId: BigInt(parsed.data.badgeId),
    operatorId: BigInt(guard.session.userId),
    ip: req.headers.get("x-forwarded-for"),
  });
  if (!outcome.ok) {
    const status = outcome.reason === "duplicate" ? 409 : 404;
    const message =
      outcome.reason === "duplicate"
        ? "该徽章已授予此用户。"
        : outcome.reason === "badge_not_found"
          ? "徽章不存在。"
          : "用户不存在。";
    return apiError(status, "BADGE_GRANT_FAILED", message);
  }
  return apiOk({ grantId: outcome.grantId.toString(), amount: outcome.amount }, 201);
}
