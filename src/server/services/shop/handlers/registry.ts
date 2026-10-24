import "server-only";
import type { z } from "zod";
import type { Order, OrderItem } from "@/generated/business";
import type { ValidatedCartParams } from "@/server/services/shop/param-schemas";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";
import { itemSendHandler } from "./item-send";
import { itemRestoreHandler } from "./item-restore";
import {
  charChangeFactionHandler,
  charChangeRaceHandler,
  charCustomizeHandler,
  charRenameHandler,
} from "./character-change";
import { nameUnlockHandler } from "./name-unlock";
import { charCloneHandler, charTransferHandler } from "./char-move";
import { guildChangeHandler } from "./guild-change";

/**
 * 发货处理器注册表(soap-delivery 契约 §处理器注册表):
 * itemsend_* 前缀统一由 ItemSendHandler 承接;其余 SKU 精确匹配(9 个服务处理器)。
 * resolveHandler 未命中 ⇒ 商品保存被拒(FR-126)+ 发货层防御性拒绝(DELIVERY_NO_HANDLER)。
 */

export type OrderItemCtx = {
  item: OrderItem;
  order: Order;
  params: ValidatedCartParams;
  /** 下单用户游戏账号 id(UPPER 约定经 auth 库解析) */
  gameAccountId: number;
  /** 发货幂等键 = orderitem:{item_id}:{attempt}(失败可重试,成功回放) */
  idempotencyKey: string;
};

/** precheck 上下文:结账(支付前拦截)与发货共用;username 供处理器查游戏账号 */
export type PrecheckContext = {
  userId: bigint;
  username: string;
  gameAccountId: number;
  params: ValidatedCartParams;
};

export type DeliveryResult =
  | { ok: true; soapCallId: bigint }
  | { ok: false; error: string };

export interface DeliveryHandler {
  /** 精确键;前缀型处理器(itemsend_)由 resolveHandler 前缀路由 */
  skuKey: string;
  /** 与 param-schemas 矩阵同源(加购/结账双重把关,契约 §处理器注册表) */
  validateSchema: z.ZodType<ValidatedCartParams>;
  /** 前置校验:结账支付前(失败→422 零写入)与发货前(失败→行 failed)双拦;抛错消息面向用户 */
  precheck?(ctx: PrecheckContext): Promise<void>;
  execute(ctx: OrderItemCtx): Promise<DeliveryResult>;
}

const exactHandlers = new Map<string, DeliveryHandler>([
  [itemRestoreHandler.skuKey, itemRestoreHandler],
  [charChangeRaceHandler.skuKey, charChangeRaceHandler],
  [charChangeFactionHandler.skuKey, charChangeFactionHandler],
  [charCustomizeHandler.skuKey, charCustomizeHandler],
  [charRenameHandler.skuKey, charRenameHandler],
  [nameUnlockHandler.skuKey, nameUnlockHandler],
  [charTransferHandler.skuKey, charTransferHandler],
  [charCloneHandler.skuKey, charCloneHandler],
  [guildChangeHandler.skuKey, guildChangeHandler],
]);

export function resolveHandler(sku: string): DeliveryHandler | null {
  if (sku.startsWith(ITEMSEND_SKU_PREFIX)) return itemSendHandler;
  return exactHandlers.get(sku) ?? null;
}
