import "server-only";
import { prisma } from "@/lib/db";

/** 站点用户身份查询(跨域基础):app 层不直连 prisma */
export async function getSiteUsername(userId: bigint): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  return user?.username ?? null;
}
