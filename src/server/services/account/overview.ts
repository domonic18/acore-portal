import "server-only";
import { prisma } from "@/lib/db";
import {
  GameDbError,
  listOwnCharacters,
  resolveGameAccountId,
} from "@/server/services/characters";

/**
 * 账号概览页数据组装(RSC 页面禁直连 prisma,数据访问收敛 service 层)。
 * characterCount = null 表示游戏库不可用(503 局部错误语义),由视图决定降级展示。
 */
export async function getAccountOverview(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, nickname: true, email: true },
  });

  const recentTransactions = await prisma.pointTransaction.findMany({
    where: { userId: user.id },
    orderBy: { id: "desc" },
    take: 5,
    select: { id: true, type: true, amount: true, remark: true, createdAt: true },
  });

  let characterCount: number | null = null;
  try {
    const accountId = await resolveGameAccountId(user.username);
    characterCount =
      accountId === null ? 0 : (await listOwnCharacters(accountId)).length;
  } catch (err) {
    if (!(err instanceof GameDbError)) throw err;
  }

  return {
    user: { username: user.username, nickname: user.nickname, email: user.email },
    characterCount,
    recentTransactions,
  };
}
