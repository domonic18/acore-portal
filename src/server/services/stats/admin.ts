import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";
import { countLowStockProducts } from "@/server/services/catalog/admin";

/** 后台总览计数卡(低库存/发货异常/用户/复核;顶栏告警已于 2026-11-03 收敛至此) */
export type AdminDashboardCounts = {
  lowStock: number;
  deliveryFailed: number;
  userCount: number;
  reviewPending: number;
};

export async function getAdminDashboardCounts(): Promise<AdminDashboardCounts> {
  const [lowStock, deliveryFailed, userCount, reviewPending] = await Promise.all([
    countLowStockProducts(),
    prisma.order.count({ where: { status: ORDER_STATUS.DELIVERY_FAILED } }),
    prisma.user.count(),
    prisma.migrationReviewItem.count({ where: { resolvedAt: null } }),
  ]);
  return { lowStock, deliveryFailed, userCount, reviewPending };
}
