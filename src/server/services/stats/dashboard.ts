import "server-only";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { POINT_TX_TYPE } from "@/constants/points";
import { getServerStatus } from "@/server/services/status/status";
import { getConversionFunnel, EMPTY_FUNNEL, type ConversionFunnel } from "./funnel";
import {
  getPageViewSummary,
  EMPTY_PAGE_VIEW_SUMMARY,
  type PageViewSummary,
} from "./page-view";
import {
  notFoundDayKey,
  NOT_FOUND_DASHBOARD_DAYS,
} from "./not-found";

/**
 * 统计看板聚合(US4 T026,FR-313/R12):区块只读查询,
 * 全部容错(区块失败降级空值,不拖垮整响应)。
 */
export type DashboardData = {
  online: { source: "probe" | "degraded"; current: number };
  articleTop: { slug: string; title: string; views: number }[];
  notFoundTop: { path: string; count: number }[];
  orders7d: { count: number; pointsSpent: number };
  users7d: { newRegistered: number };
  funnel: ConversionFunnel;
  pageView: PageViewSummary;
};

const TOP_N = 10;

/** 近 7 日 404 hash 合并 top10(单键失败降级空,不影响其余日) */
async function notFoundTop(): Promise<{ path: string; count: number }[]> {
  const merged = new Map<string, number>();
  const now = Date.now();
  for (let i = 0; i < NOT_FOUND_DASHBOARD_DAYS; i++) {
    const key = notFoundDayKey(new Date(now - i * 24 * 3600 * 1000));
    try {
      const fields = await redis.hgetall(key);
      for (const [path, count] of Object.entries(fields)) {
        merged.set(path, (merged.get(path) ?? 0) + Number(count));
      }
    } catch {
      // 单日不可得跳过
    }
  }
  return [...merged.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);
}

export async function getDashboard(): Promise<DashboardData> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [
    status,
    articleTop,
    notFound,
    orderCount,
    spentAgg,
    newRegistered,
    funnel,
    pageView,
  ] = await Promise.all([
      getServerStatus().catch(() => null),
      prisma.article
        .findMany({
          where: { status: "published" },
          orderBy: { views: "desc" },
          take: TOP_N,
          select: { slug: true, title: true, views: true },
        })
        .catch(() => []),
      notFoundTop(),
      prisma.order.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      prisma.pointTransaction
        .aggregate({
          where: {
            type: POINT_TX_TYPE.SHOP_PAYMENT,
            amount: { lt: 0 },
            createdAt: { gte: since },
          },
          _sum: { amount: true },
        })
        .catch(() => ({ _sum: { amount: null } })),
      prisma.user.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
      getConversionFunnel().catch(() => EMPTY_FUNNEL),
      getPageViewSummary().catch(() => EMPTY_PAGE_VIEW_SUMMARY),
    ]);

  return {
    online:
      status && "enabled" in status && status.enabled
        ? {
            source: status.degraded ? "degraded" : "probe",
            current: status.onlineCount ?? 0,
          }
        : { source: "degraded", current: 0 },
    articleTop,
    notFoundTop: notFound,
    orders7d: { count: orderCount, pointsSpent: Math.abs(spentAgg._sum.amount ?? 0) },
    users7d: { newRegistered },
    funnel,
    pageView,
  };
}
