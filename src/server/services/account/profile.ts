import "server-only";
import { prisma } from "@/lib/db";

/** 账户设置页用户名/邮箱/昵称(RSC 页面禁直连 prisma) */
export async function getAccountProfile(userId: bigint) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true, email: true, nickname: true },
  });
}
