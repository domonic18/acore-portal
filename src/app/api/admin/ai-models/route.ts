import type { NextRequest } from "next/server";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  AiModelError,
  aiModelCreateSchema,
  createAiModel,
  listAiModelsAdmin,
} from "@/server/services/shared/ai-models/crud";

/** 模型条目列表(脱敏视图;含定位/最近测试) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ models: await listAiModelsAdmin() });
}

/** 新建模型条目(apiKey 可缺省 = 无鉴权;测试连接另走 probe) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, aiModelCreateSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const model = await createAiModel(parsed.data, BigInt(guard.session.userId));
    return apiOk({ model });
  } catch (err) {
    if (err instanceof AiModelError) return apiError(422, err.code, err.message);
    throw err;
  }
}
