import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { setAiModelEnabled } from "@/server/services/shared/ai-models/crud";

const schema = z.object({ enabled: z.boolean() });

/** 启停模型条目(停用主力 = 绑定侧自动落备用,无需改绑定) */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:id 不是合法的条目编号。");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const model = await setAiModelEnabled(id, parsed.data.enabled, BigInt(guard.session.userId));
    return apiOk({ model });
  } catch (err) {
    if (err instanceof Error && err.name === "PrismaClientKnownRequestError") {
      return apiError(404, "NOT_FOUND", "模型条目不存在。");
    }
    throw err;
  }
}
