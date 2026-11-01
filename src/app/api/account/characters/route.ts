import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { GameDbError } from "@/server/services/shared/game-identity";
import { listCharactersForUser } from "@/server/services/account/characters";

/** 契约:200 {characters}/401 未登录/503 GAME_DB_UNAVAILABLE(不白屏) */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  try {
    const characters = await listCharactersForUser(BigInt(session.userId));
    if (characters === null) return apiError(401, "UNAUTHORIZED", "请先登录。");
    return apiOk({ characters });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
