import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { prisma } from "@/lib/db";
import {
  GameDbError,
  characterOwnedBy,
  listRestorableItems,
  resolveGameAccountId,
} from "@/server/services/account/characters-game";

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

  const user = await prisma.user.findUnique({
    where: { id: BigInt(session.userId) },
    select: { username: true },
  });
  if (!user) return apiError(401, "UNAUTHORIZED", "请先登录。");

  try {
    const accountId = await resolveGameAccountId(user.username);
    if (accountId === null) return apiOk({ items: [] });

    const owned = await characterOwnedBy(accountId, guid);
    if (!owned) {
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.OWNERSHIP_VIOLATION,
        actorUserId: BigInt(session.userId),
        payload: { scope: "restore_items", guid },
        ip: req.headers.get("x-forwarded-for"),
      });
      return apiError(403, "CHARACTER_NOT_OWNED", "只能查看自己名下角色的物品。");
    }
    return apiOk({ items: await listRestorableItems(guid) });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
