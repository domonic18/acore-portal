import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { getClientIp } from "@/server/services/shared/client-ip";
import { listPointRules, savePointRules } from "@/server/services/points/admin";
import { POINT_RULE_AMOUNT_MAX, POINT_RULE_EVENTS } from "@/constants/points";

const schema = z.object({
  rules: z
    .array(
      z.object({
        event: z.enum(POINT_RULE_EVENTS),
        amount: z.number().int().min(0).max(POINT_RULE_AMOUNT_MAX),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

/** 积分规则列表(后台管控页;缺行的事件也返回,便于补种) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const rules = await listPointRules();
  return apiOk({ rules });
}

/** 保存积分规则(分值 + 开关);仅对实际变化的规则落审计 */
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const outcome = await savePointRules({
    changes: parsed.data.rules,
    operatorId: BigInt(guard.session.userId),
    ip: await getClientIp(req),
  });
  if (!outcome.ok) {
    if (outcome.reason === "invalid_event") {
      return apiError(422, "VALIDATION_ERROR", "参数错误:rules.event 不是受管的积分规则事件。");
    }
    return apiError(422, "VALIDATION_ERROR", "参数错误:rules.amount 超出允许范围。");
  }
  const rules = await listPointRules();
  return apiOk({ changed: outcome.changed, rules });
}
