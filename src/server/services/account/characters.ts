import "server-only";
import {
  listOwnCharacters,
  resolveGameAccountId,
  type OwnCharacter,
} from "@/server/services/shared/game-identity";
import { getSiteUsername } from "@/server/services/shared/site-identity";

/**
 * 本人角色投影组装:业务侧定位(username→game account)+游戏侧只读列表。
 * 游戏库不可用时上抛 GameDbError,由视图转 503 错误面板(不白屏)。
 */

/** API 路由用:用户不存在返回 null(路由转 401) */
export async function listCharactersForUser(
  userId: bigint,
): Promise<OwnCharacter[] | null> {
  const username = await getSiteUsername(userId);
  if (username === null) return null;
  const accountId = await resolveGameAccountId(username);
  return accountId === null ? [] : await listOwnCharacters(accountId);
}

/** 页面用:会话用户行必然存在 */
export async function listAccountCharacters(userId: bigint) {
  const characters = await listCharactersForUser(userId);
  if (characters === null) throw new Error(`account not found: ${userId}`);
  return characters;
}
