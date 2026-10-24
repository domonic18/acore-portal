import "server-only";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { schemaOf } from "../param-schemas";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler } from "./registry";

/**
 * GuildChangeHandler(soap-delivery 映射表):公会名合法性在参数矩阵
 * schema 关(长度/字符集/首尾空格),发货仅实查角色名后执行。
 */
export const guildChangeHandler: DeliveryHandler = {
  skuKey: "guild-change",
  validateSchema: schemaOf("guild-change"),

  async execute({ item, order, params, gameAccountId, idempotencyKey }) {
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) return { ok: false, error: "角色不存在或已不在本人账号名下" };
    const result = await executeDeliveryCommand(".guild change", [charName, params.guildName!], {
      idempotencyKey,
      requestedBy: `order:${order.id}:item:${item.id}`,
    });
    return result.status === "success"
      ? { ok: true, soapCallId: BigInt(result.callId) }
      : { ok: false, error: result.error };
  },
};
