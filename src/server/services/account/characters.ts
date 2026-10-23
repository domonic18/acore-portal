import "server-only";
import { prisma } from "@/lib/db";
import {
  listOwnCharacters,
  resolveGameAccountId,
} from "@/server/services/characters";

/**
 * 本人角色投影组装:业务侧定位(username→game account)+游戏侧只读列表。
 * 游戏库不可用时上抛 GameDbError,由视图转 503 错误面板(不白屏)。
 */
export async function listAccountCharacters(userId: bigint) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true },
  });
  const accountId = await resolveGameAccountId(user.username);
  return accountId === null ? [] : await listOwnCharacters(accountId);
}
