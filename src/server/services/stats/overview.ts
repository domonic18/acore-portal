import "server-only";
import { prisma } from "@/lib/db";
import { POINT_TX_TYPE } from "@/constants/points";
import {
  STATS_RANGE_DAYS,
  STATS_RANGE_LABEL,
  type StatsRangeKey,
} from "@/constants/stats";
import {
  getArchiveAcquisition,
  getArchiveAudience,
  getArchiveHourly,
  getArchiveLastDate,
  getArchiveTopPages,
  type ArchiveAcquisition,
  type ArchiveAudience,
  type ArchiveHourly,
  type ArchiveTopPage,
} from "./archive";
import { getPageViewDaily, type PageViewDailyPoint } from "./page-view";
import { getTrafficTrend } from "./traffic";

/**
 * 统计看板总览聚合(2026-11-07 数据看板重构):
 * 按「区间」口径把两代数据源合成一条时间线——WP Statistics 存档(截至 2026-10-23)
 * + 自建 page_view_event 埋点(2026-10-24 起),并给出环比(KPI)与构成维度。
 *
 * 存档维度(画像/获客/搜索词/Top 页面)来自 wp_legacy,随旧站下线而冻结,
 * 看板以其「数据截至」标注;自建维度(埋点/交易/注册)是当前实况。
 */
const DAY_MS = 24 * 3600 * 1000;
const START_OF_TIME = new Date(0);
const TOP_PAGE_LIMIT = 15;
const DIMENSION_LIMIT = 8;

export type TimelinePoint = { date: string; pv: number; uv: number };

export type Metric = {
  value: number;
  prev: number;
  /** 环比百分比;上一周期为 0 时无法计算,置 null */
  delta: number | null;
};

export type StatsOverview = {
  range: StatsRangeKey;
  rangeLabel: string;
  /** 区间跨度天数(全部区间按实际数据跨度) */
  spanDays: number;
  /** 展示用时间线(长区间已按周/月分桶) */
  timeline: TimelinePoint[];
  /** 桶粒度(天):1=按日 7=按周 30=按月 */
  bucketDays: number;
  kpi: {
    pv: Metric;
    uv: Metric;
    orders: Metric;
    points: Metric;
    users: Metric;
  };
  audience: ArchiveAudience;
  acquisition: ArchiveAcquisition;
  hourly: ArchiveHourly[];
  topPages: (ArchiveTopPage & { share: number })[];
  archive: { available: boolean; lastDate: string | null };
};

export const EMPTY_AUDIENCE: ArchiveAudience = {
  devices: [],
  platforms: [],
  browsers: [],
  countries: [],
};

export const EMPTY_ACQUISITION: ArchiveAcquisition = {
  engines: [],
  directCount: 0,
  referrers: [],
  terms: [],
};

function toMetric(value: number, prev: number): Metric {
  return {
    value,
    prev,
    delta: prev > 0 ? Number((((value - prev) / prev) * 100).toFixed(1)) : null,
  };
}

/**
 * 时间线分桶:长区间按周/月聚合,避免一次画上千个点。
 * UV 为「按日去重后累加」,分桶后取桶内合计(与日粒度口径一致)。
 */
export function bucketTimeline(
  points: TimelinePoint[],
  bucketDays: number,
): TimelinePoint[] {
  if (bucketDays <= 1 || points.length === 0) return points;
  const start = new Date(`${points[0]!.date}T00:00:00Z`).getTime();
  const buckets = new Map<number, TimelinePoint>();
  for (const p of points) {
    const t = new Date(`${p.date}T00:00:00Z`).getTime();
    const index = Math.floor((t - start) / (bucketDays * DAY_MS));
    const existing = buckets.get(index);
    if (existing) {
      existing.pv += p.pv;
      existing.uv += p.uv;
    } else {
      buckets.set(index, { date: p.date, pv: p.pv, uv: p.uv });
    }
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 区间跨度决定桶粒度:≤120 天按日,≤800 天按周,否则按月 */
export function pickBucketDays(spanDays: number): number {
  if (spanDays <= 120) return 1;
  if (spanDays <= 800) return 7;
  return 30;
}

/** 合并存档日汇总与自建埋点日汇总(同日累加) */
function mergeDaily(
  archive: { date: string; uv: number; pv: number }[],
  own: PageViewDailyPoint[],
): TimelinePoint[] {
  const merged = new Map<string, TimelinePoint>();
  for (const p of archive) {
    merged.set(p.date, { date: p.date, pv: p.pv, uv: p.uv });
  }
  for (const p of own) {
    const existing = merged.get(p.date);
    if (existing) {
      existing.pv += p.pv;
      existing.uv += p.uv;
    } else {
      merged.set(p.date, { date: p.date, pv: p.pv, uv: p.uv });
    }
  }
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function sum(points: TimelinePoint[]): { pv: number; uv: number } {
  return points.reduce(
    (acc, p) => ({ pv: acc.pv + p.pv, uv: acc.uv + p.uv }),
    { pv: 0, uv: 0 },
  );
}

/** 业务侧区间指标:订单数 / 积分消耗 / 新注册 */
async function tradeMetrics(since: Date, until: Date): Promise<{
  orders: number;
  points: number;
  users: number;
}> {
  const [orders, spent, users] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: since, lt: until } } }),
    prisma.pointTransaction
      .aggregate({
        where: {
          type: POINT_TX_TYPE.SHOP_PAYMENT,
          amount: { lt: 0 },
          createdAt: { gte: since, lt: until },
        },
        _sum: { amount: true },
      })
      .catch(() => ({ _sum: { amount: null } })),
    prisma.user.count({ where: { createdAt: { gte: since, lt: until } } }),
  ]);
  return {
    orders,
    points: Math.abs(spent._sum.amount ?? 0),
    users,
  };
}

/**
 * 看板总览:一次返回 KPI(含环比)、时间线、访客画像、获客维度、Top 页面。
 * 存档侧查询失败(未导入存档)一律降级为空值,不影响自建维度与 KPI。
 */
export async function getStatsOverview(range: StatsRangeKey): Promise<StatsOverview> {
  const days = STATS_RANGE_DAYS[range];
  const now = new Date();
  const curStart = days ? new Date(now.getTime() - days * DAY_MS) : START_OF_TIME;
  const prevStart = days ? new Date(now.getTime() - 2 * days * DAY_MS) : null;
  const fetchSince = prevStart ?? curStart;

  const [
    archiveDaily,
    ownDaily,
    curTrade,
    prevTrade,
    audience,
    acquisition,
    hourly,
    topPages,
    lastDate,
  ] = await Promise.all([
    getTrafficTrend({ since: fetchSince })
      .then((t) => t.points)
      .catch(() => []),
    getPageViewDaily({ since: fetchSince }).catch(() => []),
    tradeMetrics(curStart, now),
    prevStart ? tradeMetrics(prevStart, curStart) : Promise.resolve(null),
    getArchiveAudience({ since: curStart, limit: DIMENSION_LIMIT }).catch(
      () => EMPTY_AUDIENCE,
    ),
    getArchiveAcquisition({ since: curStart, limit: DIMENSION_LIMIT }).catch(
      () => EMPTY_ACQUISITION,
    ),
    getArchiveHourly({ since: curStart }).catch(() => []),
    getArchiveTopPages({ since: curStart, limit: TOP_PAGE_LIMIT }).catch(() => []),
    getArchiveLastDate().catch(() => null),
  ]);

  const daily = mergeDaily(archiveDaily, ownDaily);
  const curPoints = days
    ? daily.filter((p) => p.date >= curStart.toISOString().slice(0, 10))
    : daily;
  const prevPoints =
    prevStart && days
      ? daily.filter((p) => {
          const d = p.date;
          return d >= prevStart.toISOString().slice(0, 10) && d < curStart.toISOString().slice(0, 10);
        })
      : [];

  const curSum = sum(curPoints);
  const prevSum = sum(prevPoints);

  const spanDays = curPoints.length > 0 ? curPoints.length : (days ?? 0);
  const bucketDays = pickBucketDays(spanDays);
  const totalTopHits = topPages.reduce((s, p) => s + p.hits, 0);

  return {
    range,
    rangeLabel: STATS_RANGE_LABEL[range],
    spanDays,
    timeline: bucketTimeline(curPoints, bucketDays),
    bucketDays,
    kpi: {
      pv: toMetric(curSum.pv, prevSum.pv),
      uv: toMetric(curSum.uv, prevSum.uv),
      orders: toMetric(curTrade.orders, prevTrade?.orders ?? 0),
      points: toMetric(curTrade.points, prevTrade?.points ?? 0),
      users: toMetric(curTrade.users, prevTrade?.users ?? 0),
    },
    audience,
    acquisition,
    hourly,
    topPages: topPages.map((p) => ({
      ...p,
      share:
        totalTopHits > 0 ? Number(((p.hits / totalTopHits) * 100).toFixed(1)) : 0,
    })),
    archive: { available: lastDate !== null, lastDate },
  };
}
