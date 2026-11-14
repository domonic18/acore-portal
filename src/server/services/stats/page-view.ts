import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { beijingDayKeyCompact } from "@/lib/format";
import {
  PAGE_VIEW_PATH_MAX,
  PAGE_VIEW_RETENTION_DAYS,
  PAGE_VIEW_DASHBOARD_WINDOW_HOURS,
  PAGE_VIEW_EXCLUDED_PREFIXES,
} from "@/constants/page-view";

/**
 * 页面访问埋点(自建流量统计,2026-11-06 起替代 umami):
 * 前台客户端 beacon 上报 path → 本服务落 page_view_event 表,
 * 看板按时间窗聚合 PV/UV 与页面访问占比。
 *
 * 访客标识:IP + 当日盐哈希(不留原始 IP;同一 IP 当日视为同一访客,跨日重新计数)。
 * 写入失败静默(观测数据,不得影响前台页面)。
 */

export type PageViewSummary = {
  pv: number;
  uv: number;
  topPages: { path: string; count: number; share: number }[];
};

export const EMPTY_PAGE_VIEW_SUMMARY: PageViewSummary = {
  pv: 0,
  uv: 0,
  topPages: [],
};

/** 当日盐(yyyyMMdd):跨日盐变 → 同一访客每日重新计数
 *  日界取北京自然日——与日桶(CONVERT_TZ +08:00)同一口径,
 *  否则访客标识会在北京 08:00 换盐、与日桶错开,同一北京日里算出两个 UV */
function daySalt(d: Date): string {
  return beijingDayKeyCompact(d);
}

/** 访客标识:IP + 当日盐的 sha256(64 hex);无 IP 时退化为固定匿名标识 */
export function visitorIdFromIp(ip: string | null, d: Date = new Date()): string {
  return createHash("sha256")
    .update(`${ip ?? "anonymous"}|${daySalt(d)}`)
    .digest("hex");
}

/** 路径规范化:仅站内相对路径、去查询串、截断;不合法返回 null */
export function normalizePagePath(raw: string): string | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\n")) return null;
  const path = raw.split("?")[0]!.split("#")[0]!.slice(0, PAGE_VIEW_PATH_MAX);
  if (!path) return null;
  if (PAGE_VIEW_EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return null;
  }
  return path;
}

/** 惰性清理标记键:当日首次写入触发一次超期数据清理(避免每次上报都查库) */
function pruneMarkerKey(d: Date): string {
  return `stats:pv:pruned:${daySalt(d)}`;
}

/** 删除超期事件;返回删除行数(清理失败不影响主流程) */
export async function prunePageViews(retentionDays = PAGE_VIEW_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);
  try {
    const res = await prisma.pageViewEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return res.count;
  } catch {
    return 0;
  }
}

/** 记录一次页面访问;path 非法或写库失败均静默(不抛) */
export async function recordPageView(
  rawPath: string,
  ip: string | null,
): Promise<boolean> {
  const path = normalizePagePath(rawPath);
  if (!path) return false;

  try {
    await prisma.pageViewEvent.create({
      data: { path, visitorId: visitorIdFromIp(ip) },
    });
  } catch {
    return false;
  }

  // 当日首次写入触发一次超期清理(SET NX 保证一天只清一次)
  try {
    const first = await redis.set(pruneMarkerKey(new Date()), "1", "EX", 2 * 24 * 3600, "NX");
    if (first === "OK") {
      await prunePageViews();
    }
  } catch {
    // 清理失败不影响计数
  }
  return true;
}

/**
 * 看板统计:时间窗内 PV / UV 与页面访问占比 Top10。
 * UV 用 COUNT(DISTINCT visitor_id);占比=该页次数/窗口 PV。
 */
export async function getPageViewSummary(
  windowHours = PAGE_VIEW_DASHBOARD_WINDOW_HOURS,
): Promise<PageViewSummary> {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);

  const [pv, uvRows, grouped] = await Promise.all([
    prisma.pageViewEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(DISTINCT visitor_id) AS c
      FROM page_view_event
      WHERE created_at >= ${since}
    `,
    prisma.pageViewEvent.groupBy({
      by: ["path"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
  ]);

  const total = pv;
  return {
    pv,
    uv: Number(uvRows[0]?.c ?? 0),
    topPages: grouped.map((g) => ({
      path: g.path,
      count: g._count._all,
      share: total > 0 ? Number(((g._count._all / total) * 100).toFixed(1)) : 0,
    })),
  };
}

export type PageViewDailyPoint = { date: string; pv: number; uv: number };

/**
 * 自建埋点日序列(看板趋势与存档日汇总合并成一条连续时间线):
 * PV=当日上报次数;UV=当日去重访客数(访客标识按日加盐,跨日重新计数)。
 *
 * 日桶按**北京自然日**切(created_at 存 UTC,直接 DATE_FORMAT 会按 UTC 日切,
 * 与存档侧(WP Statistics 的北京日)和页面显示的日期对不上——"今天"要等北京
 * 08:00 才翻页)。CONVERT_TZ 用固定偏移,不依赖 MySQL 时区表是否载入。
 */
export async function getPageViewDaily(opts: {
  since: Date;
  until?: Date;
}): Promise<PageViewDailyPoint[]> {
  const until = opts.until ?? new Date();
  const rows = await prisma.$queryRaw<{ d: string; pv: bigint; uv: bigint }[]>`
    SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m-%d') AS d,
           COUNT(*) AS pv,
           COUNT(DISTINCT visitor_id) AS uv
    FROM page_view_event
    WHERE created_at >= ${opts.since} AND created_at < ${until}
    GROUP BY d
    ORDER BY d ASC
  `;
  return rows.map((r) => ({
    date: r.d,
    pv: Number(r.pv),
    uv: Number(r.uv),
  }));
}
