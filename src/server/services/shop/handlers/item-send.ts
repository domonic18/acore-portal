import "server-only";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";
import { ITEM_SEND_PARAM_SCHEMA } from "@/server/services/shop/param-schemas";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler } from "./registry";

/**
 * ItemSendHandler(soap-delivery 契约 §SKU→处理器→命令映射):
 * .send items --{char} "{subject}" "{text}" {itemId}:{count}
 * 角色名按 guid+账号实查 characters 库(发货时刻名册为准);物品 id 取 SKU 快照后缀。
 */
export const itemSendHandler: DeliveryHandler = {
  skuKey: `${ITEMSEND_SKU_PREFIX}*`,
  validateSchema: ITEM_SEND_PARAM_SCHEMA,

  async execute({ item, order, params, gameAccountId, idempotencyKey }) {
    const itemId = Number(item.sku.slice(ITEMSEND_SKU_PREFIX.length));
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return { ok: false, error: `SKU 物品 id 非法: ${item.sku}` };
    }
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) {
      return { ok: false, error: "角色不存在或已不在本人账号名下" };
    }

    const result = await executeDeliveryCommand(
      ".send items",
      [
        `--${charName}`,
        `【老克塔】订单 ${order.orderNo}`,
        "感谢您的购买,附件为所购物品,请查收。",
        `${itemId}:${item.qty}`,
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
