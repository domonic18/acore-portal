import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_ITEM_DELIVERY_STATUS, ORDER_STATUS } from "@/constants/shop";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { resolveGameAccountId } from "@/server/services/shared/game-identity";
import type { ValidatedCartParams } from "./param-schemas";
import { resolveHandler, type OrderItemCtx } from "./handlers/registry";
import { sendDeliveryFailureAlert } from "./delivery-alert";
import { transitionOrder } from "./state-machine";

/**
 * 发货管线(soap-delivery 契约 §发货执行流程):
 * 订单 delivering(短瞬态)→ 逐行 resolveHandler → execute(幂等键=orderitem:{id},不带 attempt 序)
 * → 行 delivered/failed → 全 delivered ⇒ completed 自动闭环,任一失败 ⇒ delivery_failed+摘要。
 * 幂等语义(issue #67):同键 success/unknown 回放首次结果不重发(SOAP 成功后本地更新失败也可收口);
 * failed=确定性失败(游戏端未执行)删行后同键重执行;unknown(超时/不可解析)门控禁止自动重发待人工核对。
 * 并发互斥(issue #68):驱动以 deliveryClaimUntil 条件更新原子领取租约,并发驱动/恢复扫描仅一方执行。
 * 崩溃恢复(issue #66):滞留 delivering 超阈值 + 滞留 paid(结账后驱动丢失)由扫描重新驱动
 * (无独立队列表,状态查询即队列)。
 */

const DELIVERY_STALL_MS = 5 * 60_000;
/** paid 滞留阈值:覆盖结账后 fire-and-forget 驱动丢失的窗口 */
const PAID_STALL_MS = 2 * 60_000;
/** 驱动租约时长:与 DELIVERY_STALL_MS 对齐,租约到期即可被恢复扫描重新领取 */
const DELIVERY_CLAIM_MS = DELIVERY_STALL_MS;
const DELIVERY_ERROR_MAX = 255;

/** 发货行幂等键:固定 orderitem:{item_id};多封邮寄由处理器追加 :m{i} 子键 */
function itemKey(itemId: bigint): string {
  return `orderitem:${itemId}`;
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

  // 原子领取互斥租约(issue #68):并发驱动/恢复扫描与在途驱动撞车时仅一方执行;
  // 未释放(进程崩溃)时租约到期自动可再领取
  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      OR: [{ deliveryClaimUntil: null }, { deliveryClaimUntil: { lt: new Date() } }],
    },
    data: { deliveryClaimUntil: new Date(Date.now() + DELIVERY_CLAIM_MS) },
  });
  if (claimed.count === 0) return;

  // paid/delivery_failed → delivering;已在 delivering(崩溃恢复重入)则跳过迁移
  if (order.status !== ORDER_STATUS.DELIVERING) {
    await transitionOrder(prisma, orderId, ORDER_STATUS.DELIVERING);
  }

  const gameAccountId = await resolveGameAccountId(order.user.username);
  const errors: string[] = [];

  for (const item of order.items) {
    if (item.deliveryStatus === ORDER_ITEM_DELIVERY_STATUS.DELIVERED) continue;

    const handler = resolveHandler(item.sku, item.handlerKey);
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
      idempotencyKey: itemKey(item.id),
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
    await prisma.order.update({
      where: { id: orderId },
      data: { deliveryError: null, deliveryClaimUntil: null },
    });
    return;
  }

  await transitionOrder(prisma, orderId, ORDER_STATUS.DELIVERY_FAILED);
  const summary = errors.join("; ").slice(0, DELIVERY_ERROR_MAX);
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryError: summary, deliveryClaimUntil: null },
  });
  // 告警只报「首次落到 delivery_failed」:人工重试再失败不重复打扰
  if (order.status !== ORDER_STATUS.DELIVERY_FAILED) {
    void sendDeliveryFailureAlert({
      orderId: order.id.toString(),
      username: order.user.username,
      items: order.items.map((i) => ({ name: i.name, sku: i.sku })),
      error: summary,
    }).catch((err) => console.error("[delivery-alert] 发货失败告警异常:", err));
  }
}

/**
 * 崩溃恢复扫描(issue #66):
 * ① 滞留 delivering 超阈值(deliveringAt 超时)——驱动中进程崩溃;
 * ② 滞留 paid 超阈值(paidAt 超时)——结账后 fire-and-forget 驱动丢失(进程重启/异常)。
 * 单订单恢复失败不阻塞其余(逐单 .catch 记日志)。
 */
export async function recoverStalledDeliveries(): Promise<{
  delivering: number;
  paid: number;
}> {
  const now = Date.now();
  const [stalled, stalledPaid] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: ORDER_STATUS.DELIVERING,
        deliveringAt: { lt: new Date(now - DELIVERY_STALL_MS) },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.order.findMany({
      where: {
        status: ORDER_STATUS.PAID,
        paidAt: { lt: new Date(now - PAID_STALL_MS) },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  for (const row of [...stalled, ...stalledPaid]) {
    await driveOrderDelivery(row.id).catch((err) => {
      console.error(`[recover-deliveries] 订单 ${row.id} 恢复驱动失败:`, err);
    });
  }
  return { delivering: stalled.length, paid: stalledPaid.length };
}
