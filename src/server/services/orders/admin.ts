import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_ITEM_DELIVERY_STATUS, ORDER_STATUS, type OrderStatusValue } from "@/constants/shop";
import { ADMIN_ORDER_PAGE_SIZE } from "@/constants/pagination";
import { pageSlice, totalPageCount } from "@/lib/pagination";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { POINT_TX_TYPE } from "@/constants/points";
import { writeAudit } from "@/server/services/shared/audit";
import { creditLedger } from "@/server/services/shared/ledger";
import { listCharacterNamesByUsernames } from "@/server/services/shared/game-identity";
import { transitionOrder } from "@/server/services/shop/state-machine";
import { driveOrderDelivery } from "@/server/services/shop/delivery";

/**
 * 后台订单管理(api-admin 契约,FR-129/quickstart S5.4):
 * 补发=delivery_failed 单重驱动(幂等键机制在 delivery 层,已 delivered 行跳过,
 * 重复补发不重复发货 SC-102);退款=shop_payment 正向回补流水(remark=订单退款 #orderNo,
 * SUM 不变式保持)+库存回补+refunded+审计含前后余额;D3 复核落定 approve→completed/
 * 驳回→cancelled(存量单独立于状态机,data-model §2.9,防覆盖已终态退款)。
 */

export class OrderAdminError extends Error {
  constructor(
    public code: "NOT_FOUND" | "INVALID_STATUS",
    message?: string,
  ) {
    super(message ?? `order_admin_error: ${code}`);
    this.name = "OrderAdminError";
  }
}

export async function listAdminOrders(opts: { status?: string; page?: number }): Promise<{
  orders: {
    id: string;
    orderNo: string;
    username: string;
    nickname: string | null;
    characterNames: string[];
    status: OrderStatusValue;
    pointCost: number;
    itemCount: number;
    createdAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const status = (Object.values(ORDER_STATUS) as string[]).includes(opts.status ?? "")
    ? (opts.status as OrderStatusValue)
    : undefined;
  const where = status ? { status } : {};
  const { skip, take } = pageSlice(page, ADMIN_ORDER_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take,
      select: {
        id: true,
        orderNo: true,
        status: true,
        pointCost: true,
        createdAt: true,
        user: { select: { username: true, nickname: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  // 用户列展示「账号 + 游戏角色名」:游戏库不可达时降级为只显示账号(不阻断列表)
  const characterNames = await loadCharacterNames(rows.map((o) => o.user.username));
  return {
    page,
    totalPages: totalPageCount(total, ADMIN_ORDER_PAGE_SIZE),
    total,
    orders: rows.map((o) => ({
      id: o.id.toString(),
      orderNo: o.orderNo,
      username: o.user.username,
      nickname: o.user.nickname,
      characterNames: characterNames.get(o.user.username.toUpperCase()) ?? [],
      status: o.status as OrderStatusValue,
      pointCost: o.pointCost,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

/** 批量取游戏角色名;游戏库不可达 → 降级为空映射(列表照常展示账号) */
async function loadCharacterNames(usernames: string[]): Promise<Map<string, string[]>> {
  try {
    return await listCharacterNamesByUsernames(usernames);
  } catch (err) {
    console.error("[orders/admin] 角色名加载失败,降级为只显示账号", err);
    return new Map();
  }
}

/** 订单详情页 DTO:BigInt/日期在 service 序列化,页面不做 ORM 适配(issue #78) */
export type AdminOrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  pointCost: number;
  createdAt: string;
  legacyWpOrderId: number | null;
  user: { id: string; username: string; nickname: string | null; email: string };
  items: {
    id: string;
    name: string;
    sku: string;
    unitPrice: number;
    qty: number;
    deliveryStatus: string;
    productSlug: string;
  }[];
};

export async function getAdminOrderDetail(id: bigint): Promise<AdminOrderDetail | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, nickname: true, email: true } },
      items: { include: { product: { select: { slug: true } } } },
    },
  });
  if (!order) return null;
  return {
    id: order.id.toString(),
    orderNo: order.orderNo,
    status: order.status,
    pointCost: order.pointCost,
    createdAt: order.createdAt.toISOString(),
    legacyWpOrderId: order.legacyWpOrderId,
    user: {
      id: order.user.id.toString(),
      username: order.user.username,
      nickname: order.user.nickname,
      email: order.user.email,
    },
    items: order.items.map((item) => ({
      id: item.id.toString(),
      name: item.name,
      sku: item.sku,
      unitPrice: item.unitPrice,
      qty: item.qty,
      deliveryStatus: item.deliveryStatus,
      productSlug: item.product.slug,
    })),
  };
}

/** 仪表盘最新订单(只读,limit 1-20) */
export async function getRecentOrders(limit = 8) {
  const take = Math.min(Math.max(limit, 1), 20);
  const rows = await prisma.order.findMany({
    orderBy: { id: "desc" },
    take,
    select: {
      id: true,
      orderNo: true,
      status: true,
      pointCost: true,
      createdAt: true,
      user: { select: { username: true, nickname: true } },
      _count: { select: { items: true } },
    },
  });
  return rows.map((o) => ({
    id: o.id.toString(),
    orderNo: o.orderNo,
    username: o.user.username,
    nickname: o.user.nickname,
    status: o.status as OrderStatusValue,
    pointCost: o.pointCost,
    itemCount: o._count.items,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** D3 复核清单(api-admin 契约;T062):resolved=0 待复核(默认)/1 已落定/all 全部 */
export async function listMigrationReviews(opts: {
  resolved?: "0" | "1" | "all";
  page?: number;
}): Promise<{
  items: {
    id: string;
    legacyWpOrderId: number;
    reason: string;
    detail: unknown;
    resolvedAt: string | null;
    orderNo: string | null;
    username: string | null;
    nickname: string | null;
    orderStatus: string | null;
    pointCost: number | null;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const resolved =
    opts.resolved === "1" ? true : opts.resolved === "all" ? undefined : false;
  const where = resolved === undefined ? {} : { resolvedAt: resolved ? { not: null } : null };
  const { skip, take } = pageSlice(page, ADMIN_ORDER_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.migrationReviewItem.count({ where }),
    prisma.migrationReviewItem.findMany({
      where,
      orderBy: { id: "asc" },
      skip,
      take,
      select: {
        id: true,
        legacyWpOrderId: true,
        reason: true,
        detail: true,
        resolvedAt: true,
      },
    }),
  ]);
  // 存量单可能已被脚本外途径清理:order 缺行时列表仍展示(review 行为真相源)
  const orderRows = await prisma.order.findMany({
    where: { legacyWpOrderId: { in: rows.map((r) => r.legacyWpOrderId) } },
    select: {
      legacyWpOrderId: true,
      orderNo: true,
      status: true,
      pointCost: true,
      user: { select: { username: true, nickname: true } },
    },
  });
  const orderMap = new Map(orderRows.map((o) => [o.legacyWpOrderId, o]));
  return {
    page,
    totalPages: totalPageCount(total, ADMIN_ORDER_PAGE_SIZE),
    total,
    items: rows.map((r) => {
      const o = orderMap.get(r.legacyWpOrderId);
      return {
        id: r.id.toString(),
        legacyWpOrderId: r.legacyWpOrderId,
        reason: r.reason,
        detail: r.detail,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        orderNo: o?.orderNo ?? null,
        username: o?.user.username ?? null,
        nickname: o?.user.nickname ?? null,
        orderStatus: o?.status ?? null,
        pointCost: o ? o.pointCost : null,
      };
    }),
  };
}

/** delivery_failed 订单补发:重驱动→按行返回最新状态;审计 order_redeliver */
export async function redeliverOrder(
  orderId: bigint,
  operatorId: bigint,
  ip?: string | null,
): Promise<{ items: { id: string; deliveryStatus: string }[] }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNo: true, status: true },
  });
  if (!order) throw new OrderAdminError("NOT_FOUND", "订单不存在。");
  if (order.status !== ORDER_STATUS.DELIVERY_FAILED) {
    throw new OrderAdminError("INVALID_STATUS", "仅发货异常订单可补发。");
  }

  await driveOrderDelivery(orderId);

  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { id: true, deliveryStatus: true },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.ORDER_REDELIVER,
    actorUserId: operatorId,
    payload: {
      orderId: orderId.toString(),
      orderNo: order.orderNo,
      results: items.map((i) => ({
        orderItemId: i.id.toString(),
        deliveryStatus: i.deliveryStatus,
      })),
    },
    ip,
  });
  return {
    items: items.map((i) => ({ id: i.id.toString(), deliveryStatus: i.deliveryStatus })),
  };
}

const REFUNDABLE: readonly OrderStatusValue[] = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.DELIVERY_FAILED,
  ORDER_STATUS.COMPLETED,
];

/** 退款:回补积分(shop_payment 正向流水)+库存回补+refunded,审计含前后余额 */
export async function refundOrder(
  orderId: bigint,
  operatorId: bigint,
  ip?: string | null,
): Promise<{ balanceAfter: number }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { id: true, productId: true, qty: true } } },
  });
  if (!order) throw new OrderAdminError("NOT_FOUND", "订单不存在。");
  if (!REFUNDABLE.includes(order.status as OrderStatusValue)) {
    throw new OrderAdminError("INVALID_STATUS", "当前状态不可退款。");
  }

  const balanceAfter = await prisma.$transaction(async (tx) => {
    const before =
      (
        await tx.pointAccount.findUnique({
          where: { userId: order.userId },
          select: { balance: true },
        })
      )?.balance ?? 0;
    const after = await creditLedger(tx, {
      userId: order.userId,
      amount: order.pointCost,
      type: POINT_TX_TYPE.SHOP_PAYMENT,
      remark: `订单退款 #${order.orderNo}`,
      refType: "order",
      refId: order.id,
    });
    // 库存回补:仅启用库存的商品(取消/退款回补为普通 UPDATE,data-model §3)
    for (const item of order.items) {
      await tx.product.updateMany({
        where: { id: item.productId, stockEnabled: true },
        data: { stock: { increment: item.qty } },
      });
    }
    await transitionOrder(tx, order.id, ORDER_STATUS.REFUNDED);
    await writeAudit({
      category: AUDIT_CATEGORY.ADMIN,
      action: AUDIT_ACTION.ORDER_REFUND,
      actorUserId: operatorId,
      payload: {
        orderId: order.id.toString(),
        orderNo: order.orderNo,
        userId: order.userId.toString(),
        pointCost: order.pointCost,
        before,
        after,
      },
      ip,
    });
    return after;
  });
  return { balanceAfter };
}

/** D3 复核落定(data-model §2.9):approve→completed/驳回→cancelled;审计 review_resolved */
export async function resolveMigrationReview(
  reviewId: bigint,
  opts: { approve: boolean; note?: string },
  operatorId: bigint,
  ip?: string | null,
): Promise<void> {
  const review = await prisma.migrationReviewItem.findUnique({ where: { id: reviewId } });
  if (!review || review.resolvedAt) throw new OrderAdminError("NOT_FOUND", "复核项不存在或已落定。");
  const target = opts.approve ? ORDER_STATUS.COMPLETED : ORDER_STATUS.CANCELLED;
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // 存量单独立于状态机;条件守卫防覆盖已终态(refunded/cancelled 不再翻转)
    await tx.order.updateMany({
      where: {
        legacyWpOrderId: review.legacyWpOrderId,
        status: { notIn: [ORDER_STATUS.REFUNDED, ORDER_STATUS.CANCELLED] },
      },
      data: {
        status: target,
        ...(target === ORDER_STATUS.COMPLETED ? { completedAt: now } : { cancelledAt: now }),
      },
    });
    await tx.migrationReviewItem.update({
      where: { id: reviewId },
      data: { resolvedAt: now, resolvedBy: operatorId },
    });
    await writeAudit({
      category: AUDIT_CATEGORY.ADMIN,
      action: AUDIT_ACTION.REVIEW_RESOLVED,
      actorUserId: operatorId,
      payload: {
        reviewId: reviewId.toString(),
        legacyWpOrderId: review.legacyWpOrderId,
        approve: opts.approve,
        note: opts.note ?? null,
      },
      ip,
    });
  });
}
