import "server-only";
import { prisma } from "@/lib/db";

/** 账户设置页用户名/邮箱/昵称(RSC 页面禁直连 prisma) */
export async function getAccountProfile(userId: bigint) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, email: true, nickname: true },
  });
}

/** 仅昵称可自助修改(邮箱走 change-email 独立流程) */
export async function updateAccountNickname(userId: bigint, nickname: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { nickname },
    select: { id: true, username: true, nickname: true, email: true },
  });
}
