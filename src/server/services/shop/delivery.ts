import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_ITEM_DELIVERY_STATUS, ORDER_STATUS } from "@/constants/shop";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { resolveGameAccountId } from "@/server/services/shared/game-identity";
import type { ValidatedCartParams } from "./param-schemas";
import { resolveHandler, type OrderItemCtx } from "./handlers/registry";
import { transitionOrder } from "./state-machine";

/**
 * 发货管线(soap-delivery 契约 §发货执行流程):
 * 订单 delivering(短瞬态)→ 逐行 resolveHandler → execute(幂等键=orderitem:{id}:{attempt})
 * → 行 delivered/failed → 全 delivered ⇒ completed 自动闭环,任一失败 ⇒ delivery_failed+摘要。
 * 幂等键带 attempt 序:成功后重复驱动同键回放(命令数不变,SC-102);失败补发以新键重试。
 * 崩溃恢复:滞留 delivering 超阈值的订单重新驱动(无独立队列表,状态查询即队列)。
 */

const DELIVERY_STALL_MS = 5 * 60_000;
const DELIVERY_ERROR_MAX = 255;

function itemKey(itemId: bigint): string {
  return `orderitem:${itemId}:`;
}

/** 当前行应使用的幂等键:既有 soap_call 数 + 1(仅统计本行前缀) */
async function nextAttemptKey(itemId: bigint): Promise<string> {
  const count = await prisma.soapCall.count({
    where: { idempotencyKey: { startsWith: itemKey(itemId) } },
  });
  return `${itemKey(itemId)}${count + 1}`;
}

export async function driveOrderDelivery(orderId: bigint): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, user: { select: { username: true } } },
  });
  if (!order) return;
  if (
    order.status !== ORDER_STATUS.PAID &&
    order.status !== ORDER_STATUS.DELIVERING &&
    order.status !== ORDER_STATUS.DELIVERY_FAILED
  ) {
    return;
  }

  // paid/delivery_failed → delivering;已在 delivering(崩溃恢复重入)则跳过迁移
  if (order.status !== ORDER_STATUS.DELIVERING) {
    await transitionOrder(prisma, orderId, ORDER_STATUS.DELIVERING);
  }

  const gameAccountId = await resolveGameAccountId(order.user.username);
  const errors: string[] = [];

  for (const item of order.items) {
    if (item.deliveryStatus === ORDER_ITEM_DELIVERY_STATUS.DELIVERED) continue;

    const handler = resolveHandler(item.sku);
    if (!handler || gameAccountId === null) {
      errors.push(`${item.sku}: DELIVERY_NO_HANDLER`);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { deliveryStatus: ORDER_ITEM_DELIVERY_STATUS.FAILED },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SHOP,
        action: AUDIT_ACTION.DELIVERY_NO_HANDLER,
        actorUserId: order.userId,
        payload: { orderId: order.id.toString(), itemId: item.id.toString(), sku: item.sku },
      });
      continue;
    }

    const params = item.params as ValidatedCartParams;
    // 处理器前置(结账时已拦过一次,发货侧兜底):失败→行 failed 可补发
    if (handler.precheck) {
      try {
        await handler.precheck({
          userId: order.userId,
          username: order.user.username,
          gameAccountId,
          params,
        });
      } catch (err) {
        errors.push(`${item.sku}: ${err instanceof Error ? err.message : String(err)}`);
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { deliveryStatus: ORDER_ITEM_DELIVERY_STATUS.FAILED },
        });
        continue;
      }
    }

    const ctx: OrderItemCtx = {
      item,
      order,
      params,
      gameAccountId,
      idempotencyKey: await nextAttemptKey(item.id),
    };
    try {
      const result = await handler.execute(ctx);
      if (result.ok) {
        await prisma.orderItem.update({
          where: { id: item.id },
          data: {
            deliveryStatus: ORDER_ITEM_DELIVERY_STATUS.DELIVERED,
            deliveredAt: new Date(),
            soapCallId: result.soapCallId,
          },
        });
      } else {
        errors.push(`${item.sku}: ${result.error}`);
        await prisma.orderItem.update({
          where: { id: item.id },
          data: { deliveryStatus: ORDER_ITEM_DELIVERY_STATUS.FAILED },
        });
      }
    } catch (err) {
      // precheck/意外异常:行 failed 可重试,订单转 delivery_failed
      errors.push(`${item.sku}: ${err instanceof Error ? err.message : String(err)}`);
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { deliveryStatus: ORDER_ITEM_DELIVERY_STATUS.FAILED },
      });
    }
  }

  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { deliveryStatus: true },
  });
  const allDelivered =
    items.length > 0 &&
    items.every((i) => i.deliveryStatus === ORDER_ITEM_DELIVERY_STATUS.DELIVERED);

  if (allDelivered) {
    await transitionOrder(prisma, orderId, ORDER_STATUS.COMPLETED);
    await prisma.order.update({ where: { id: orderId }, data: { deliveryError: null } });
    return;
  }

  await transitionOrder(prisma, orderId, ORDER_STATUS.DELIVERY_FAILED);
  const summary = errors.join("; ").slice(0, DELIVERY_ERROR_MAX);
  await prisma.order.update({ where: { id: orderId }, data: { deliveryError: summary } });
}

/** 崩溃恢复扫描:滞留 delivering 超阈值(deliveringAt 超时)的订单重新驱动 */
export async function recoverStalledDeliveries(): Promise<number> {
  const stalled = await prisma.order.findMany({
    where: {
      status: ORDER_STATUS.DELIVERING,
      deliveringAt: { lt: new Date(Date.now() - DELIVERY_STALL_MS) },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  for (const order of stalled) {
    await driveOrderDelivery(order.id);
  }
  return stalled.length;
}
