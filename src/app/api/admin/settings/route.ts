import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup } from "@/server/services/settings/save";

// GET:分组掩码态视图(只写不读者只回布尔,连接串回脱敏串,任何明文凭据不回)
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk(await getSettingsView());
}

const putSchema = z.object({
  group: z.string(),
  values: z.record(z.string(), z.unknown()),
});

// PUT:组级全量提交(非空敏感字段=覆写,空=保持);保存即 reloadSystemConfig 热生效
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  const result = await saveSettingsGroup(parsed.data.group, parsed.data.values, {
    id: BigInt(guard.session.userId),
  });
  if (!result.ok) {
    return apiError(422, result.code, result.message);
  }
  return apiOk({ ok: true });
}
