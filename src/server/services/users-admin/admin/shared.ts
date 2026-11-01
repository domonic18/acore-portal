import "server-only";
import { prisma } from "@/lib/db";

/**
 * 后台用户/徽章/邀请码管理(api-admin 契约,FR-130/FR-104):
 * 用户模糊搜索分页;徽章授予 badge_reward 流水 amount 读 point_rule(event=badge_grant,
 * 0/停用跳过入账),重复授予 DUPLICATE(unique badgeId+userId);邀请码批量生成
 * (count 1-200,复用 M1 表与状态机,expired 不落库实时推导)。
 */

export class UsersAdminError extends Error {
  constructor(
    public code: "DUPLICATE" | "NOT_FOUND" | "BADGE_NOT_FOUND" | "PARAM_INVALID",
    message?: string,
  ) {
    super(message ?? `users_admin_error: ${code}`);
    this.name = "UsersAdminError";
  }
}

export function isUnique(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

/** 后台外壳显示名(admin layout 顶栏) */
export async function getAdminDisplayName(userId: bigint): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  return user?.username ?? "管理员";
}
