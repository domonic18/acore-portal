import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { saveStatusConfig } from "@/server/services/status/status";

// currentNodeId 收数字串:JSON 无 bigint,服务层转 BigInt 落库
const schema = z.object({
  enabled: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  currentNodeId: z.string().regex(/^\d+$/).optional(),
});

/** 状态人工三键(T045;quickstart S6.5):PUT 后 reloadSystemConfig 即时生效+审计;指针失效返回告警位 */
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const result = await saveStatusConfig(
    {
      enabled: parsed.data.enabled,
      maintenanceMode: parsed.data.maintenanceMode,
      currentNodeId:
        parsed.data.currentNodeId === undefined
          ? undefined
          : BigInt(parsed.data.currentNodeId),
    },
    { id: BigInt(guard.session.userId) },
  );
  return apiOk({ pointerInvalid: result.pointerInvalid });
}
