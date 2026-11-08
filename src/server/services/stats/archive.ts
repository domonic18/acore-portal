import "server-only";
import { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { LEGACY_SITE_HOSTS } from "@/constants/legacy-routes";
import {
  ARCHIVE_BROWSER_LABEL,
  ARCHIVE_DEVICE_LABEL,
  ARCHIVE_PLATFORM_LABEL,
  archiveCountryLabel,
  archiveDimensionLabel,
  isSearchEngineHost,
  SEARCH_TERM_MAX_LENGTH,
  SEARCH_TERM_MIN_LENGTH,
  SEARCH_TERM_PARAM_PRIORITY,
} from "@/constants/stats";

/**
 * WP Statistics 存档读取层(2026-11-07 数据看板重构):
 * 只读 wp_legacy 存档库,还原原 WP Statistics 后台的访客画像维度
 * (设备/系统/浏览器/地区、搜索引擎/外部引荐/搜索词、Top 页面、时段分布)。
 *
 * 存档随旧站下线而冻结(最后一天 2026-10-23),因此这些维度是「历史画像」;
 * 看板对每张存档卡片标注数据截止日,避免与自建埋点(2026-10-24 起)口径混淆。
 *
 * 与 traffic.ts 同款约定:全字面量 SQL + 值绑定,不用 Prisma.join/Prisma.raw
 * (Next RSC 打包后嵌套 Sql 片段退化为占位参数,实测 1064 语法错)。
 * 存档表不存在(生产未导入)时抛错,由调用方 catch 降级「暂无数据」。
 */
const START_OF_TIME = new Date(0);
const DEFAULT_LIMIT = 10;
const REFERRER_POOL_LIMIT = 100;
const TERM_URL_POOL_LIMIT = 300;

type Num = bigint | number | Prisma.Decimal;

function toNumber(v: Num | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export type NamedCount = { name: string; count: number };

export type ArchiveAudience = {
  devices: NamedCount[];
  platforms: NamedCount[];
  browsers: NamedCount[];
  countries: NamedCount[];
};

export type ArchiveAcquisition = {
  engines: NamedCount[];
  directCount: number;
  referrers: NamedCount[];
  terms: { term: string; count: number }[];
};

export type ArchiveTopPage = { uri: string; type: string; hits: number };

export type ArchiveHourly = { hour: number; count: number };

/** 自家站点(旧站 lokta.cn 及其子域)——引荐统计里属内部跳转,不算外部来源 */
function isSelfHost(host: string): boolean {
  const h = host.toLowerCase();
  return LEGACY_SITE_HOSTS.some(
    (own) => h === own || h.endsWith(`.${own}`),
  );
}

function normalizeName(raw: string | null): string {
  return (raw ?? "").trim();
}

/**
 * 归一化搜索词:去首尾引号/波浪号、截断、过滤百度 SEO 垃圾词
 * (形如 'battleq4v' 的字母+数字混排随机串;纯中文与含空格的短语一律保留)。
 */
export function normalizeSearchTerm(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^~+/, "")
    .replace(/~+$/, "")
    .replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’]+$/, "")
    .trim();
  if (cleaned.length < SEARCH_TERM_MIN_LENGTH) return null;
  if (cleaned.length > SEARCH_TERM_MAX_LENGTH) {
    return cleaned.slice(0, SEARCH_TERM_MAX_LENGTH);
  }
  const hasCjk = /[一-龥]/.test(cleaned);
  if (!hasCjk && !/\s/.test(cleaned)) {
    // 无中文且无空格:仅「含数字」或「过短」判为随机串丢弃
    if (/\d/.test(cleaned) || cleaned.length < 3) return null;
  }
  return cleaned;
}

/** 从搜索引擎引荐 URL 解析搜索词(非搜索引擎或无词返回 null) */
export function parseSearchTerm(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!isSearchEngineHost(parsed.hostname)) return null;
  for (const key of SEARCH_TERM_PARAM_PRIORITY) {
    const value = parsed.searchParams.get(key);
    if (value && value.trim()) return normalizeSearchTerm(value);
  }
  return null;
}

type RawNamedCount = { name: string | null; c: Num };

function toNamed(
  rows: RawNamedCount[],
  mapName: (n: string | null) => string,
): NamedCount[] {
  return rows.map((r) => ({ name: mapName(r.name), count: toNumber(r.c) }));
}

/**
 * 归一化后同名的维度合并计数(如 mobile:smart 与 smartphone 同归「手机」),
 * 合并后按计数降序,避免看板出现同名重复条目。
 */
function mergeNamedCounts(rows: NamedCount[]): NamedCount[] {
  const merged = new Map<string, number>();
  for (const r of rows) {
    merged.set(r.name, (merged.get(r.name) ?? 0) + r.count);
  }
  return [...merged.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** 访客画像:设备 / 操作系统 / 浏览器 / 地区(各自 Top N,按访客数) */
export async function getArchiveAudience(opts?: {
  since?: Date;
  limit?: number;
}): Promise<ArchiveAudience> {
  const cutoff = opts?.since ?? START_OF_TIME;
  const limit = Math.max(1, Math.floor(opts?.limit ?? DEFAULT_LIMIT));

  const [devices, platforms, browsers, countries] = await Promise.all([
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
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT agent AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
      GROUP BY agent
      ORDER BY c DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT location AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff} AND location IS NOT NULL AND location <> ''
      GROUP BY location
      ORDER BY c DESC
      LIMIT ${limit}
    `,
  ]);

  return {
    devices: mergeNamedCounts(
      toNamed(devices, (n) => archiveDimensionLabel(n, ARCHIVE_DEVICE_LABEL)),
    ),
    platforms: mergeNamedCounts(
      toNamed(platforms, (n) => archiveDimensionLabel(n, ARCHIVE_PLATFORM_LABEL)),
    ),
    browsers: mergeNamedCounts(
      toNamed(browsers, (n) => archiveDimensionLabel(n, ARCHIVE_BROWSER_LABEL)),
    ),
    countries: mergeNamedCounts(
      toNamed(countries, (n) => archiveCountryLabel(n)),
    ),
  };
}

/** 获客维度:搜索引擎(来源名)、直接访问、外部引荐(按域名)、搜索词 */
export async function getArchiveAcquisition(opts?: {
  since?: Date;
  limit?: number;
}): Promise<ArchiveAcquisition> {
  const cutoff = opts?.since ?? START_OF_TIME;
  const limit = Math.max(1, Math.floor(opts?.limit ?? DEFAULT_LIMIT));

  const [engineRows, directRow, referrerRows, termRows] = await Promise.all([
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT source_name AS name, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
        AND source_name IS NOT NULL AND source_name <> '' AND source_name <> 'Direct'
      GROUP BY source_name
      ORDER BY c DESC
      LIMIT ${limit}
    `,
    prisma.$queryRaw<{ c: Num }[]>`
      SELECT COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff} AND source_name = 'Direct'
    `,
    prisma.$queryRaw<RawNamedCount[]>`
      SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(referred, '://', -1), '/', 1) AS name,
             COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff} AND referred <> ''
      GROUP BY name
      ORDER BY c DESC
      LIMIT ${REFERRER_POOL_LIMIT}
    `,
    prisma.$queryRaw<{ url: string; c: Num }[]>`
      SELECT referred AS url, COUNT(*) AS c
      FROM wp_legacy.wp_statistics_visitor
      WHERE last_counter >= ${cutoff}
        AND referred <> ''
        AND (
          referred LIKE '%baidu.com%' OR referred LIKE '%bing.com%'
          OR referred LIKE '%google.%' OR referred LIKE '%so.com%'
          OR referred LIKE '%sogou.com%' OR referred LIKE '%sm.cn%'
          OR referred LIKE '%yandex.%' OR referred LIKE '%duckduckgo.com%'
          OR referred LIKE '%yahoo.%' OR referred LIKE '%aol.%'
          OR referred LIKE '%ecosia.org%' OR referred LIKE '%quark.cn%'
        )
      GROUP BY referred
      ORDER BY c DESC
      LIMIT ${TERM_URL_POOL_LIMIT}
    `,
  ]);

  // 外部引荐:排除自家站点与搜索引擎域名(搜索引擎单列一块)
  const referrers = referrerRows
    .map((r) => ({ name: normalizeName(r.name), count: toNumber(r.c) }))
    .filter((r) => r.name && !isSelfHost(r.name) && !isSearchEngineHost(r.name))
    .slice(0, limit);

  // 搜索词:同一 URL 的访客数按词聚合
  const termCounts = new Map<string, number>();
  for (const row of termRows) {
    const term = parseSearchTerm(row.url);
    if (!term) continue;
    termCounts.set(term, (termCounts.get(term) ?? 0) + toNumber(row.c));
  }
  const terms = [...termCounts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    engines: toNamed(engineRows, (n) => normalizeName(n) || "其它"),
    directCount: toNumber(directRow[0]?.c),
    referrers,
    terms,
  };
}

/** Top 页面(按浏览量;uri 为站内路径,type 为 WP 页面类型) */
export async function getArchiveTopPages(opts?: {
  since?: Date;
  limit?: number;
}): Promise<ArchiveTopPage[]> {
  const cutoff = opts?.since ?? START_OF_TIME;
  const limit = Math.max(1, Math.floor(opts?.limit ?? DEFAULT_LIMIT));

  const rows = await prisma.$queryRaw<{ uri: string; type: string; hits: Num }[]>`
    SELECT uri, type, SUM(\`count\`) AS hits
    FROM wp_legacy.wp_statistics_pages
    WHERE \`date\` >= ${cutoff}
    GROUP BY uri, type
    ORDER BY hits DESC
    LIMIT ${limit}
  `;

  return rows.map((r) => ({
    uri: r.uri,
    type: r.type,
    hits: toNumber(r.hits),
  }));
}

/** 访客时段分布(按最后一次访问的小时) */
export async function getArchiveHourly(opts?: {
  since?: Date;
}): Promise<ArchiveHourly[]> {
  const cutoff = opts?.since ?? START_OF_TIME;

  const rows = await prisma.$queryRaw<{ h: Num; c: Num }[]>`
    SELECT HOUR(last_view) AS h, COUNT(*) AS c
    FROM wp_legacy.wp_statistics_visitor
    WHERE last_counter >= ${cutoff}
    GROUP BY h
    ORDER BY h ASC
  `;

  return rows.map((r) => ({ hour: toNumber(r.h), count: toNumber(r.c) }));
}

/** 存档最后有数据的日期(看板标注「数据截至」用) */
export async function getArchiveLastDate(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ d: string | null }[]>`
    SELECT DATE_FORMAT(MAX(\`date\`), '%Y-%m-%d') AS d
    FROM wp_legacy.wp_statistics_summary_totals
  `;
  return rows[0]?.d ?? null;
}
