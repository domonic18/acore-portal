import "server-only";
import { getWorldDb } from "@/lib/db/world";
import { GameDbError } from "@/server/services/shared/game-identity";

/**
 * 物品类 SKU 存在性校验(FR-126):gameItemId 须存在于 world.item_template
 * (只读 SELECT);后台商品保存消费(S5.2),cart 不做此校验。
 */
export async function gameItemExists(entry: number): Promise<boolean> {
  try {
    const hit = await (await getWorldDb()).itemTemplate.findFirst({
      where: { entry },
      select: { entry: true },
    });
    return hit !== null;
  } catch (err) {
    console.error("[sku-check] item_template lookup failed", err);
    throw new GameDbError("物品模板库不可用");
  }
}
