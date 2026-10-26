import "server-only";
import { TRANSMOG_ITEM_SKU_PREFIX, parseTransmogSku } from "@/constants/shop";
import { ITEM_SEND_PARAM_SCHEMA } from "@/server/services/shop/param-schemas";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler } from "./registry";

/**
 * TransmogItemHandler(WP TransmogItemSend 同款实现,2026-10-26 接入):
 * .transmog add {char} {itemId}——真机自定义模块命令(usage 探针核对:
 * "Adds an item to a player's appearance collection",子命令 add / add set / check / reload)。
 * 外观收集性质:qty 不参与,多买仅收藏一次(WP 同款);商品标题"限联盟/部落"为
 * 自选约束,WP 未做服务端校验,保持一致(模块侧按物品生效)。qty=1 单封语义。
 */
export const transmogItemHandler: DeliveryHandler = {
  skuKey: `${TRANSMOG_ITEM_SKU_PREFIX}*`,
  validateSchema: ITEM_SEND_PARAM_SCHEMA,

  async execute({ item, order, params, gameAccountId, idempotencyKey }) {
    const itemId = parseTransmogSku(item.sku);
    if (!itemId) {
      return { ok: false, error: `SKU 物品 id 非法: ${item.sku}` };
    }
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) {
      return { ok: false, error: "角色不存在或已不在本人账号名下" };
    }
    const result = await executeDeliveryCommand(".transmog add", [charName, String(itemId)], {
      idempotencyKey,
      requestedBy: `order:${order.id}:item:${item.id}`,
    });
    return result.status === "success"
      ? { ok: true, soapCallId: BigInt(result.callId) }
      : { ok: false, error: result.error };
  },
};
