import "server-only";
import { authDb } from "@/lib/db/auth";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { schemaOf } from "../param-schemas";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler, OrderItemCtx } from "./registry";

/**
 * 角色转移/复制处理器(soap-delivery 映射表):
 * precheck 目标账号存在性查 auth 库(结账 422 支付前拦截,quickstart S4);
 * destAccount 原样入命令(消费端按 UPPER 约定解析)。
 */
function accountMoveHandler(
  skuKey: "char-transfer" | "char-clone",
  command: ".character transfer" | ".character clone",
): DeliveryHandler {
  return {
    skuKey,
    validateSchema: schemaOf(skuKey),

    async precheck({ params }) {
      const hit = await authDb.findByUsername(params.destAccount!);
      if (!hit) throw new Error("目标账号不存在,请确认后重试。");
    },

    async execute(ctx: OrderItemCtx) {
      const charName = await resolveCharacterName(ctx.params.characterGuid, ctx.gameAccountId);
      if (!charName) return { ok: false as const, error: "角色不存在或已不在本人账号名下" };
      const result = await executeDeliveryCommand(
        command,
        [charName, ctx.params.destAccount!],
        {
          idempotencyKey: ctx.idempotencyKey,
          requestedBy: `order:${ctx.order.id}:item:${ctx.item.id}`,
        },
      );
      return result.status === "success"
        ? { ok: true as const, soapCallId: BigInt(result.callId) }
        : { ok: false as const, error: result.error };
    },
  };
}

export const charTransferHandler = accountMoveHandler("char-transfer", ".character transfer");
export const charCloneHandler = accountMoveHandler("char-clone", ".character clone");
