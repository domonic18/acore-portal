import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";
import { countLowStockProducts } from "@/server/services/catalog/admin";

/** 后台外壳顶栏告警计数(admin layout) */
export type AdminBadgeCounts = {
  lowStock: number;
  deliveryFailed: number;
};

/** 后台总览四张计数卡 */
export type AdminDashboardCounts = AdminBadgeCounts & {
  userCount: number;
  reviewPending: number;
};

export async function getAdminBadgeCounts(): Promise<AdminBadgeCounts> {
  const [lowStock, deliveryFailed] = await Promise.all([
    countLowStockProducts(),
    prisma.order.count({ where: { status: ORDER_STATUS.DELIVERY_FAILED } }),
  ]);
  return { lowStock, deliveryFailed };
}

export async function getAdminDashboardCounts(): Promise<AdminDashboardCounts> {
  const [counts, userCount, reviewPending] = await Promise.all([
    getAdminBadgeCounts(),
    prisma.user.count(),
    prisma.migrationReviewItem.count({ where: { resolvedAt: null } }),
  ]);
  return { ...counts, userCount, reviewPending };
}
