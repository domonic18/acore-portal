import "server-only";
import type { Prisma, PrismaClient } from "@/generated/business";
import { ORDER_STATUS, type OrderStatusValue } from "@/constants/shop";

/**
 * 订单状态机(FR-116,data-model §3):迁移表集中管理,禁止散落 set;
 * 迁移落库=状态条件 UPDATE(行锁守卫,count=0 即非法/竞争),时间戳随迁移回写。
 */

const S = ORDER_STATUS;

/** 合法迁移表(与 data-model §3 图一一对应;终态出边为空) */
export const TRANSITIONS: Record<OrderStatusValue, readonly OrderStatusValue[]> = {
  [S.PENDING]: [S.PAID],
  [S.PAID]: [S.DELIVERING, S.CANCELLED, S.REFUNDED],
  [S.DELIVERING]: [S.COMPLETED, S.DELIVERY_FAILED],
  [S.DELIVERY_FAILED]: [S.DELIVERING, S.REFUNDED],
  [S.COMPLETED]: [],
  [S.CANCELLED]: [],
  [S.REFUNDED]: [],
};

/** 状态→时间戳字段(delivery_failed 无专字段,失败摘要走 deliveryError) */
export function statusTimestampField(
  status: OrderStatusValue,
): "paidAt" | "deliveringAt" | "completedAt" | "cancelledAt" | "refundedAt" | null {
  switch (status) {
    case S.PAID:
      return "paidAt";
    case S.DELIVERING:
      return "deliveringAt";
    case S.COMPLETED:
      return "completedAt";
    case S.CANCELLED:
      return "cancelledAt";
    case S.REFUNDED:
      return "refundedAt";
    case S.DELIVERY_FAILED:
      return null;
    default:
      return null;
  }
}

export function isTerminal(status: OrderStatusValue): boolean {
  return TRANSITIONS[status].length === 0;
}

export class OrderStateError extends Error {
  constructor(from: OrderStatusValue, to: OrderStatusValue) {
    super(`Illegal order status transition: ${from} -> ${to}`);
    this.name = "OrderStateError";
  }
}

export function assertTransition(from: OrderStatusValue, to: OrderStatusValue): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new OrderStateError(from, to);
  }
}

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * 迁移落库:先断言再条件更新(WHERE status=from);count=0 → 非法迁移或并发竞争,一律抛错。
 * delivery_failed 无时间戳字段,仅切状态。
 */
export async function transitionOrder(
  tx: Tx,
  orderId: bigint,
  to: OrderStatusValue,
): Promise<void> {
  const current = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  });
  const from = current.status as OrderStatusValue;
  assertTransition(from, to);
  const tsField = statusTimestampField(to);
  const result = await tx.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: to, ...(tsField ? { [tsField]: new Date() } : {}) },
  });
  if (result.count === 0) {
    throw new OrderStateError(from, to);
  }
}
