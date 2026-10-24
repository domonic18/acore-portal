import "server-only";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { schemaOf } from "../param-schemas";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler, OrderItemCtx } from "./registry";

/**
 * 角色类服务四处理器(soap-delivery §SKU→处理器→命令映射):
 * 命令 + 实查角色名执行,归属在名册实查时强校验;命令进游戏下次登录生效。
 */

const CHAR_NOT_FOUND = "角色不存在或已不在本人账号名下";

async function runCharCommand(
  command: ".character changerace" | ".character changefaction" | ".character customize" | ".character rename",
  ctx: OrderItemCtx,
) {
  const charName = await resolveCharacterName(ctx.params.characterGuid, ctx.gameAccountId);
  if (!charName) return { ok: false as const, error: CHAR_NOT_FOUND };
  const result = await executeDeliveryCommand(command, [charName], {
    idempotencyKey: ctx.idempotencyKey,
    requestedBy: `order:${ctx.order.id}:item:${ctx.item.id}`,
  });
  return result.status === "success"
    ? { ok: true as const, soapCallId: BigInt(result.callId) }
    : { ok: false as const, error: result.error };
}

function charServiceHandler(
  skuKey: "char-change-race" | "char-change-faction" | "char-change-customize" | "char-change-name",
  command: Parameters<typeof runCharCommand>[0],
): DeliveryHandler {
  return {
    skuKey,
    validateSchema: schemaOf(skuKey),
    execute: (ctx) => runCharCommand(command, ctx),
  };
}

export const charChangeRaceHandler = charServiceHandler(
  "char-change-race",
  ".character changerace",
);
export const charChangeFactionHandler = charServiceHandler(
  "char-change-faction",
  ".character changefaction",
);
export const charCustomizeHandler = charServiceHandler(
  "char-change-customize",
  ".character customize",
);
export const charRenameHandler = charServiceHandler("char-change-name", ".character rename");
