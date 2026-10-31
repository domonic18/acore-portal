import "server-only";
import { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";

/**
 * 流量与 SEO 分析(二期迭代):只读聚合 wp_legacy 存档库
 * (WP Statistics 汇总/访客 + 百度SEO 蜘蛛日志)。跨库:业务库连接用户有 *.* 权限,
 * 直接以 wp_legacy. 前缀查询。表不存在(未导入存档)时抛出,由看板 catch 降级「暂无数据」。
 *
 * $queryRaw 全字面量 SQL + 值绑定(不用 Prisma.join/Prisma.empty/Prisma.raw:
 * Next RSC 打包后嵌套 Sql 片段退化为占位参数,实测 1064 语法错,见 stats/sales.ts)。
 * 时间窗统一以 cutoff(默认 1970)绑定,免去有无 since 的两套 SQL。
 * 蜘蛛 `num` 为同 URL/IP 的聚合次数(可达数万),抓取量统一取 SUM(num) 而非行数。
 */
const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_DAYS = 30;
const DEFAULT_TOP = 10;
const START_OF_TIME = new Date(0);

type Num = bigint | number | Prisma.Decimal;

function toNumber(v: Num | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export type TrafficTrendPoint = { date: string; uv: number; pv: number };
export type TrafficTrendData = {
  points: TrafficTrendPoint[];
  totalUv: number;
  totalPv: number;
};

/** 近 N 日 UV/PV 趋势(升序;since 优先于 days,默认近 30 日) */
export async function getTrafficTrend(opts?: {
  days?: number;
  since?: Date;
}): Promise<TrafficTrendData> {
  const days = Math.max(1, Math.floor(opts?.days ?? DEFAULT_DAYS));
  const cutoff = opts?.since ?? new Date(Date.now() - days * DAY_MS);

  const rows = await prisma.$queryRaw<{ d: string; uv: Num; pv: Num }[]>`
    SELECT DATE_FORMAT(\`date\`, '%Y-%m-%d') AS d,
           COALESCE(SUM(visitors), 0) AS uv,
           COALESCE(SUM(views), 0)    AS pv
    FROM wp_legacy.wp_statistics_summary_totals
    WHERE \`date\` >= ${cutoff}
    GROUP BY \`date\`
    ORDER BY \`date\` ASC
  `;

  const points = rows.map((r) => ({
    date: r.d,
    uv: toNumber(r.uv),
    pv: toNumber(r.pv),
  }));
  return {
    points,
    totalUv: points.reduce((s, p) => s + p.uv, 0),
    totalPv: points.reduce((s, p) => s + p.pv, 0),
  };
}

export type NamedCount = { name: string; count: number };
export type TrafficSourceData = {
  sources: NamedCount[];
  devices: NamedCount[];
  platforms: NamedCount[];
};

type RawNamedCount = { name: string | null; c: Num };

function normalizeSource(name: string | null): string {
  return name && name.trim() ? name : "直接访问";
}

function normalizeDevice(name: string | null): string {
  return name && name.trim() ? name : "未知";
}

function normalizePlatform(name: string | null): string {
  return name && name.trim() && name !== "??" ? name : "未知";
}

function toNamed(rows: RawNamedCount[], mapName: (n: string | null) => string): NamedCount[] {
  return rows.map((r) => ({ name: mapName(r.name), count: toNumber(r.c) }));
}

/** 访客来源/设备/平台 Top N(默认全量;since 为可选时间窗) */
export async function getTrafficSource(opts?: {
  limit?: number;
  since?: Date;
}): Promise<TrafficSourceData> {
  const limit = Math.max(1, Math.floor(opts?.limit ?? DEFAULT_TOP));
  const cutoff = opts?.since ?? START_OF_TIME;

  const [sources, devices, platforms] = await Promise.all([
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT source_name AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
      GROUP BY source_name
      ORDER BY c DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT device AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
      GROUP BY device
      ORDER BY c DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT platform AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
      GROUP BY platform
      ORDER BY c DESC
      LIMIT ${limit}
    `,
  ]);

  return {
    sources: toNamed(sources, normalizeSource),
    devices: toNamed(devices, normalizeDevice),
    platforms: toNamed(platforms, normalizePlatform),
  };
}

export type SpiderSummary = {
  statuses: { code: string; count: number }[];
  top404: { url: string; count: number }[];
  lastCrawl: string | null;
};

/** 百度蜘蛛抓取:状态码抓取量 + 404 URL Top N + 最近抓取日(since 可选时间窗) */
export async function getSpiderSummary(opts?: {
  top404Limit?: number;
  since?: Date;
}): Promise<SpiderSummary> {
  const top404Limit = Math.max(1, Math.floor(opts?.top404Limit ?? DEFAULT_TOP));
  const cutoff = opts?.since ?? START_OF_TIME;

  const [statusRows, top404Rows, lastRows] = await Promise.all([
    prisma.$queryRaw<{ code: Num; c: Num }[]>`
      SELECT type AS code, COALESCE(SUM(num), 0) AS c
      FROM wp_legacy.wp_baiduseo_zhizhu
      WHERE \`time\` >= ${cutoff}
      GROUP BY type
      ORDER BY c DESC
    `,
    prisma.$queryRaw<{ url: string; c: Num }[]>`
      SELECT address AS url, COALESCE(SUM(num), 0) AS c
      FROM wp_legacy.wp_baiduseo_zhizhu
      WHERE type = 404 AND \`time\` >= ${cutoff}
      GROUP BY address
      ORDER BY c DESC
      LIMIT ${top404Limit}
    `,
    prisma.$queryRaw<{ t: string | null }[]>`
      SELECT DATE_FORMAT(MAX(\`time\`), '%Y-%m-%d') AS t
      FROM wp_legacy.wp_baiduseo_zhizhu
      WHERE \`time\` >= ${cutoff}
    `,
  ]);

  return {
    statuses: statusRows.map((r) => ({
      code: String(toNumber(r.code)),
      count: toNumber(r.c),
    })),
    top404: top404Rows.map((r) => ({ url: r.url, count: toNumber(r.c) })),
    lastCrawl: lastRows[0]?.t ?? null,
  };
}
