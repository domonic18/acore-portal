import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { prisma } from "@/lib/db";
import {
  GameDbError,
  listOwnCharacters,
  resolveGameAccountId,
} from "@/server/services/characters";

/** 契约:200 {characters}/401 未登录/503 GAME_DB_UNAVAILABLE(不白屏) */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const user = await prisma.user.findUnique({
    where: { id: BigInt(session.userId) },
    select: { username: true },
  });
  if (!user) return apiError(401, "UNAUTHORIZED", "请先登录。");

  try {
    const accountId = await resolveGameAccountId(user.username);
    if (accountId === null) return apiOk({ characters: [] });
    return apiOk({ characters: await listOwnCharacters(accountId) });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
