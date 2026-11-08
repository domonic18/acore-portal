import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { searchGameItems } from "@/server/services/catalog/game-items";
import { GameDbError } from "@/server/services/shared/game-identity";

const querySchema = z.object({
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * 游戏物品检索(后台商品编辑页的物品选择器):
 * world.item_template 只读子集(entry/name/quality/stackable);库不可达 → 503 拒绝放行,
 * 前端据此禁用保存(不产出未经物品校验的商品)。
 */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.safeParse({ q: sp.get("q") ?? undefined, limit: sp.get("limit") ?? undefined });
  if (!parsed.success) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:检索条件");
  }
  try {
    const items = await searchGameItems(parsed.data);
    return apiOk({ items });
  } catch (err) {
    if (err instanceof GameDbError) {
      return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
    }
    throw err;
  }
}
