import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { saveStatusConfig } from "@/server/services/status/config";

// 2026-11-03 收敛:currentNodeId 不再从状态配置入口受理(唯一真相源=渐进计划页);
// schema 仍容忍该键以便旧客户端过渡,服务层忽略之。
const schema = z.object({
  enabled: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
});

/** 状态人工两键:PUT 后 reloadSystemConfig 即时生效+审计 */
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const result = await saveStatusConfig(
    {
      enabled: parsed.data.enabled,
      maintenanceMode: parsed.data.maintenanceMode,
    },
    { id: BigInt(guard.session.userId) },
  );
  return apiOk({ pointerInvalid: result.pointerInvalid });
}
