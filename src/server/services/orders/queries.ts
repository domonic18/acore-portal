import "server-only";
import { prisma } from "@/lib/db";
import type { OrderItemDeliveryStatus, OrderStatus } from "@/generated/business";

/**
 * 用户订单查询(归属强制过滤;api-shop 契约 GET /api/account/orders[/id]):
 * 列表带条目数分页;详情 404 防枚举(他人订单与不存在订单同响应 null)。
 */

export const ORDER_PAGE_SIZE = 10;

export type OrderListEntry = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  pointCost: number;
  itemCount: number;
  createdAt: string;
};

export type OrderListResult = {
  orders: OrderListEntry[];
  page: number;
  totalPages: number;
};

export async function listOrders(userId: bigint, page = 1): Promise<OrderListResult> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const total = await prisma.order.count({ where: { userId } });
  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    skip: (safePage - 1) * ORDER_PAGE_SIZE,
    take: ORDER_PAGE_SIZE,
    select: {
      id: true,
      orderNo: true,
      status: true,
      pointCost: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });
  return {
    page: safePage,
    totalPages,
    orders: rows.map((o) => ({
      id: o.id.toString(),
      orderNo: o.orderNo,
      status: o.status,
      pointCost: o.pointCost,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

export type OrderDetailItem = {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  qty: number;
  params: unknown;
  deliveryStatus: OrderItemDeliveryStatus;
  deliveredAt: string | null;
};

export type OrderDetail = {
  id: string;
  orderNo: string;
  status: OrderStatus;
  pointCost: number;
  deliveryError: string | null;
  createdAt: string;
  paidAt: string | null;
  completedAt: string | null;
  items: OrderDetailItem[];
};

/** 详情(归属过滤):userId 不匹配或不存在一律 null(404 防枚举) */
export async function getOrderDetail(
  userId: bigint,
  orderId: bigint,
): Promise<OrderDetail | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: {
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          sku: true,
          name: true,
          unitPrice: true,
          qty: true,
          params: true,
          deliveryStatus: true,
          deliveredAt: true,
        },
      },
    },
  });
  if (!order) return null;
  return {
    id: order.id.toString(),
    orderNo: order.orderNo,
    status: order.status,
    pointCost: order.pointCost,
    deliveryError: order.deliveryError,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    items: order.items.map((i) => ({
      id: i.id.toString(),
      sku: i.sku,
      name: i.name,
      unitPrice: i.unitPrice,
      qty: i.qty,
      params: i.params,
      deliveryStatus: i.deliveryStatus,
      deliveredAt: i.deliveredAt?.toISOString() ?? null,
    })),
  };
}
