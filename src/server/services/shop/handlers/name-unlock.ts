import "server-only";
import { getCharactersDb } from "@/lib/db/characters";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { schemaOf } from "../param-schemas";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler, OrderItemCtx } from "./registry";

/**
 * NameUnlockHandler(指定名改名变体,soap-delivery 映射表):
 * precheck 占用校验(结账 422 支付前拦截 + 发货前行 failed 双拦);
 * unlockName 已在参数矩阵 schema 规范化为首字母大写,命令携带规范名。
 */
async function runRename(ctx: OrderItemCtx) {
  const charName = await resolveCharacterName(ctx.params.characterGuid, ctx.gameAccountId);
  if (!charName) return { ok: false as const, error: "角色不存在或已不在本人账号名下" };
  const result = await executeDeliveryCommand(
    ".character rename",
    [charName, ctx.params.unlockName!],
    {
      idempotencyKey: ctx.idempotencyKey,
      requestedBy: `order:${ctx.order.id}:item:${ctx.item.id}`,
    },
  );
  return result.status === "success"
    ? { ok: true as const, soapCallId: BigInt(result.callId) }
    : { ok: false as const, error: result.error };
}

export const nameUnlockHandler: DeliveryHandler = {
  skuKey: "name-unlock",
  validateSchema: schemaOf("name-unlock"),

  async precheck({ params, gameAccountId }) {
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) throw new Error("角色不存在或已不在本人账号名下");
    const row = await (
      await getCharactersDb()
    ).characters.findFirst({ where: { name: params.unlockName }, select: { guid: true } });
    if (row) throw new Error(`名字 ${params.unlockName} 已被占用,请换一个。`);
  },

  execute: runRename,
};
