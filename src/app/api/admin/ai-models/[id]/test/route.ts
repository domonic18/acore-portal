import type { NextRequest } from "next/server";

import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { AiModelError, getAiModelStored } from "@/server/services/shared/ai-models/crud";
import { testStoredAiModel } from "@/server/services/shared/ai-models/probe";

/** 测试已存条目(用库内已存值探测;结果落 last_test_*,列表徽章刷新) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:id 不是合法的条目编号。");
  }
  const stored = await getAiModelStored(id);
  if (!stored) return apiError(404, "NOT_FOUND", "模型条目不存在。");
  try {
    const result = await testStoredAiModel(id, BigInt(guard.session.userId));
    return apiOk({ result });
  } catch (err) {
    if (err instanceof AiModelError && err.code === "NOT_FOUND") {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}
