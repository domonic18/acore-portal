import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { setUserRole } from "@/server/services/users-admin/set-role";

const schema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
});

/** 角色分配:成功即吊销目标全部会话(降权即时生效) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const userId = Number(params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return apiError(404, "NOT_FOUND", "用户不存在。");
  }
  const outcome = await setUserRole({
    actorId: BigInt(guard.session.userId),
    targetUserId: BigInt(userId),
    newRole: parsed.data.role,
    ip: req.headers.get("x-forwarded-for"),
  });
  if (!outcome.ok) {
    if (outcome.reason === "self") {
      return apiError(422, "SELF_ROLE_CHANGE", "不能修改自己的角色。");
    }
    if (outcome.reason === "last_admin") {
      return apiError(422, "LAST_ADMIN", "至少保留一名管理员,禁止降级最后一名 admin。");
    }
    return apiError(404, "NOT_FOUND", "用户不存在。");
  }
  return apiOk({ oldRole: outcome.oldRole, newRole: outcome.newRole });
}
