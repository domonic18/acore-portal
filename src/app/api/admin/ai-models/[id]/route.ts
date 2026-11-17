import type { NextRequest } from "next/server";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  AiModelError,
  aiModelUpdateSchema,
  deleteAiModel,
  updateAiModel,
} from "@/server/services/shared/ai-models/crud";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 编辑模型条目(apiKey 留空 = 保留已配置的密钥) */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(422, "VALIDATION_ERROR", "参数错误:id 不是合法的条目编号。");
  const parsed = await parseBody(req, aiModelUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const model = await updateAiModel(id, parsed.data, BigInt(guard.session.userId));
    return apiOk({ model });
  } catch (err) {
    if (err instanceof AiModelError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}

/** 删除模型条目(被角色绑定引用 → 409 引导先解绑) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(422, "VALIDATION_ERROR", "参数错误:id 不是合法的条目编号。");
  try {
    await deleteAiModel(id, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof AiModelError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      if (err.code === "BINDING_REFERENCED") return apiError(409, "BINDING_REFERENCED", err.message);
    }
    throw err;
  }
}
