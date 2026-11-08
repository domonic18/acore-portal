import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { getCurrentGroupValues } from "@/server/services/settings/current";
import { sensitiveMode } from "@/server/services/settings/schemas";
import { resolveSubmittedValue } from "@/server/services/settings/values";
import { GAME_DB_TARGETS, testGameDbConnection } from "@/server/services/settings/connection-test";

const schema = z.object({
  target: z.enum(GAME_DB_TARGETS),
  url: z.string().min(1),
});

/**
 * 测试游戏库连通(用未保存的候选连接串):口令位若仍是脱敏形态则回填现值,
 * 管理员不必为了测一次而把口令重打一遍。审计只记库名与成败。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const target = parsed.data.target;
  const current = await getCurrentGroupValues("gamedb");
  const url = resolveSubmittedValue(
    current[`gamedb.${target}`],
    parsed.data.url,
    sensitiveMode("gamedb", target),
  );
  const result = await testGameDbConnection(url);
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SETTINGS_TEST_CONNECTION,
    actorUserId: BigInt(guard.session.userId),
    payload: { channel: `gamedb.${target}`, ok: result.ok },
  });
  return apiOk(result);
}
