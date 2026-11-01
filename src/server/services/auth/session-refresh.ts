import "server-only";
import { prisma } from "@/lib/db";

/**
 * 续期索引用户:角色/状态以业务库为准(access JWT 可能已过期不可信)。
 * 用户不存在或已封禁由调用方转登录页。
 */
export async function findRefreshSubject(userId: bigint) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
}
