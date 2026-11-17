import type { NextRequest } from "next/server";

import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  AiRoleBindingError,
  listRoleBindings,
  roleBindingUpdateSchema,
  updateRoleBinding,
} from "@/server/services/shared/ai-models/bindings";

/** 角色绑定列表(缺行自动播种;后台页两卡数据源) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ bindings: await listRoleBindings() });
}

/** 更新角色绑定(存在+enabled+roles 含 role+embedding 须 openai+主力≠备用) */
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, roleBindingUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const binding = await updateRoleBinding(parsed.data, BigInt(guard.session.userId));
    return apiOk({ binding });
  } catch (err) {
    if (err instanceof AiRoleBindingError) return apiError(422, err.code, err.message);
    throw err;
  }
}
