import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { GameDbError } from "@/server/services/shared/game-identity";
import { getRestorableItems } from "@/server/services/account/restore-items";
import { getClientIp } from "@/server/services/shared/client-ip";

/**
 * 契约:200 {items}/401 未登录/403 CHARACTER_NOT_OWNED+审计/503 GAME_DB_UNAVAILABLE。
 * 本路由只读(选物列表:列该角色可恢复的物品)。
 * 恢复的**执行入口不在这里**:走商城服务类商品
 * (services/shop/handlers/item-restore.ts 的 .send items 邮寄,
 * 支付前 precheck 三关:角色归属→服务器在线→命中可恢复列表),
 * 即「下单 → 支付 → 发货」闭环,本接口只负责给选物界面供数。
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
      ip: await getClientIp(req),
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
