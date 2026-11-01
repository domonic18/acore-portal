import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { GameDbError } from "@/server/services/shared/game-identity";
import { getRestorableItems } from "@/server/services/account/restore-items";

/**
 * 契约:200 {items}/401 未登录/403 CHARACTER_NOT_OWNED+审计/503 GAME_DB_UNAVAILABLE。
 * M1 只读;执行入口 M2 开放。
 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const url = new URL(req.url);
  const guid = Number(url.searchParams.get("guid"));
  if (!Number.isInteger(guid) || guid <= 0) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:guid");
  }

  try {
    const result = await getRestorableItems({
      userId: BigInt(session.userId),
      guid,
      ip: req.headers.get("x-forwarded-for"),
    });
    if (!result.ok) {
      return result.reason === "USER_NOT_FOUND"
        ? apiError(401, "UNAUTHORIZED", "请先登录。")
        : apiError(403, "CHARACTER_NOT_OWNED", "只能查看自己名下角色的物品。");
    }
    return apiOk({ items: result.items });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
