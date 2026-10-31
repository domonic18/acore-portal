import "server-only";
import { prisma } from "@/lib/db";
import { revokeAllSessions } from "@/lib/auth/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 后台用户角色分配(US 用户角色权限管理):
 * 禁自改(防自我锁死);降最后一名 admin 拒绝;成功即吊销目标全部会话——
 * role 内嵌 JWT,吊销是降权即时生效的唯一途径(记住登录下次 refresh 重读库拿新角色)。
 * 同值不落审计不吊销(幂等直达,不无谓踢人)。
 */

export type assignableRole = "user" | "moderator" | "admin";

export type SetRoleOutcome =
  | { ok: true; oldRole: assignableRole; newRole: assignableRole; revokedSessions: number }
  | { ok: false; reason: "not_found" | "self" | "last_admin" };

export async function setUserRole(input: {
  actorId: bigint;
  targetUserId: bigint;
  newRole: assignableRole;
  ip?: string | null;
}): Promise<SetRoleOutcome> {
  if (input.actorId === input.targetUserId) return { ok: false, reason: "self" };
  const target = await prisma.user.findUnique({
    where: { id: input.targetUserId },
    select: { id: true, role: true },
  });
  if (!target) return { ok: false, reason: "not_found" };
  const oldRole = target.role as assignableRole;
  if (oldRole === input.newRole) {
    return { ok: true, oldRole, newRole: input.newRole, revokedSessions: 0 };
  }
  if (oldRole === "admin" && input.newRole !== "admin") {
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins <= 1) return { ok: false, reason: "last_admin" };
  }
  await prisma.user.update({
    where: { id: target.id },
    data: { role: input.newRole },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.USER_ROLE_CHANGE,
    actorUserId: input.actorId,
    payload: { targetUserId: target.id.toString(), oldRole, newRole: input.newRole },
    ip: input.ip,
  });
  const revokedSessions = await revokeAllSessions(target.id.toString());
  return { ok: true, oldRole, newRole: input.newRole, revokedSessions };
}
