import "server-only";
import { checkSoap } from "@/server/soap/health";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { listRestorableItems } from "@/server/services/shared/game-identity";
import { schemaOf } from "../param-schemas";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler } from "./registry";

/**
 * ItemRestoreHandler(soap-delivery 映射表):恢复物品经 .send items 邮寄
 * (与用户中心恢复同源)。precheck 三关(FR-120 支付前拦截):角色归属→
 * 服务器在线(health 探活,不落库)→ 恢复列表命中且 restorable。
 */
export const itemRestoreHandler: DeliveryHandler = {
  skuKey: "item-restoration",
  validateSchema: schemaOf("item-restoration"),

  async precheck({ params, gameAccountId }) {
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) throw new Error("角色不存在或已不在本人账号名下");
    const health = await checkSoap();
    if (!health.ok) throw new Error("游戏服务器暂不可用,装备恢复暂时无法办理,请稍后再试。");
    const items = await listRestorableItems(params.characterGuid);
    const hit = items.find((i) => i.entry === params.restoreItemEntry);
    if (!hit) throw new Error("所选物品不在该角色的可恢复列表中。");
    if (!hit.restorable) throw new Error("该物品数据缺失,暂时无法恢复,请联系客服处理。");
  },

  async execute({ item, order, params, gameAccountId, idempotencyKey }) {
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) return { ok: false, error: "角色不存在或已不在本人账号名下" };
    const result = await executeDeliveryCommand(
      ".send items",
      [
        charName,
        `"【老克塔】装备恢复 ${order.orderNo}"`,
        '"您恢复的物品已随信附上,请查收。"',
        `${params.restoreItemEntry}:${item.qty}`,
      ],
      {
        idempotencyKey,
        requestedBy: `order:${order.id}:item:${item.id}`,
      },
    );
    return result.status === "success"
      ? { ok: true, soapCallId: BigInt(result.callId) }
      : { ok: false, error: result.error };
  },
};
