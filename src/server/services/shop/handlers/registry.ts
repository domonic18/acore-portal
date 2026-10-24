import "server-only";
import type { Order, OrderItem } from "@/generated/business";
import type { ValidatedCartParams } from "@/server/services/shop/param-schemas";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";
import { itemSendHandler } from "./item-send";

/**
 * 发货处理器注册表(soap-delivery 契约 §处理器注册表):
 * itemsend_* 前缀统一由 ItemSendHandler 承接;其余 SKU 精确匹配(US4 逐个注册)。
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

export type DeliveryResult =
  | { ok: true; soapCallId: bigint }
  | { ok: false; error: string };

export interface DeliveryHandler {
  /** 精确键;前缀型处理器(itemsend_)由 resolveHandler 前缀路由 */
  skuKey: string;
  execute(ctx: OrderItemCtx): Promise<DeliveryResult>;
}

const exactHandlers = new Map<string, DeliveryHandler>();

export function registerHandler(handler: DeliveryHandler): void {
  exactHandlers.set(handler.skuKey, handler);
}

export function resolveHandler(sku: string): DeliveryHandler | null {
  if (sku.startsWith(ITEMSEND_SKU_PREFIX)) return itemSendHandler;
  return exactHandlers.get(sku) ?? null;
}
