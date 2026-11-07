import { Badge } from "@/components/ui/badge";
import { FilterChip } from "@/components/ui/filter-chip";
import { STATS_RANGE_KEYS, STATS_RANGE_LABEL, type StatsRangeKey } from "@/constants/stats";
import { ColumnChart, DonutChart, TrendChart, type TrendPoint } from "./charts";
import { Panel, ShareList, SubTitle } from "./parts";

/**
 * 流量类看板面板(2026-11-07 数据看板重构):
 * 趋势 / 来源构成 / 访客画像 / 热门页面 / 时段分布 / 搜索引擎与引荐 / 搜索词 / 爬虫。
 * 结构类型与服务层 services/stats/overview·archive 返回同形(components 禁 import server)。
 */

type NamedCount = { name: string; count: number };

/** 存档数据截至日徽标(存档随旧站下线冻结,需明示口径) */
function ArchiveBadge({ lastDate }: { lastDate: string | null }) {
  if (!lastDate) return null;
  return (
    <Badge tone="muted" title="以下维度来自 WP Statistics 存档,旧站下线后即冻结">
      存档截至 {lastDate}
    </Badge>
  );
}

/** 访问趋势:PV/UV 双序列 + 区间切换 */
export function StatsTrendPanel({
  timeline,
  bucketDays,
  range,
  archiveLastDate,
  className,
}: {
  timeline: TrendPoint[];
  bucketDays: number;
  range: StatsRangeKey;
  archiveLastDate: string | null;
  className?: string;
}) {
  const grain = bucketDays === 1 ? "按日" : bucketDays === 7 ? "按周" : "按月";
  return (
    <Panel
      className={className}
      title="访问趋势"
      testid="stats-traffic-trend"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {STATS_RANGE_KEYS.map((key) => (
            <FilterChip key={key} href={`/admin/stats?range=${key}`} active={key === range}>
              {STATS_RANGE_LABEL[key]}
            </FilterChip>
          ))}
        </div>
      }
      hint={`页面浏览量与访客数(按日去重后累加),${grain}粒度;2026-10-23 前取自 WP Statistics 存档,之后取自自建埋点。`}
    >
      <TrendChart points={timeline} />
      <div className="flex flex-wrap items-center gap-2">
        <ArchiveBadge lastDate={archiveLastDate} />
      </div>
    </Panel>
  );
}

/** 流量来源构成(搜索引擎 / 直接访问 / 外部引荐) */
export function StatsAcquisitionPanel({
  acquisition,
  archiveLastDate,
  className,
}: {
  acquisition: {
    engines: NamedCount[];
    directCount: number;
    referrers: NamedCount[];
    terms: { term: string; count: number }[];
  };
  archiveLastDate: string | null;
  className?: string;
}) {
  const engineTotal = acquisition.engines.reduce((s, e) => s + e.count, 0);
  const referralTotal = acquisition.referrers.reduce((s, e) => s + e.count, 0);
  const slices = [
    { name: "搜索引擎", value: engineTotal },
    { name: "直接访问", value: acquisition.directCount },
    { name: "外部引荐", value: referralTotal },
  ].filter((s) => s.value > 0);

  return (
    <Panel
      className={className}
      title="流量来源构成"
      testid="stats-traffic-source"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint="来源按 WP Statistics 存档口径统计:搜索引擎取 source_name,外部引荐取非搜索引擎的引荐域名(已排除自家站点)。"
    >
      <DonutChart
        items={slices}
        centerValue={slices.reduce((s, i) => s + i.value, 0).toLocaleString("zh-CN")}
        centerLabel="来源访问"
      />
    </Panel>
  );
}

/** 访客画像:设备 / 操作系统 / 浏览器 / 地区 */
export function StatsAudiencePanel({
  audience,
  archiveLastDate,
  className,
}: {
  audience: {
    devices: NamedCount[];
    platforms: NamedCount[];
    browsers: NamedCount[];
    countries: NamedCount[];
  };
  archiveLastDate: string | null;
  className?: string;
}) {
  const groups = [
    { label: "设备", items: audience.devices },
    { label: "操作系统", items: audience.platforms },
    { label: "浏览器", items: audience.browsers },
    { label: "地区", items: audience.countries },
  ];
  return (
    <Panel
      className={className}
      title="访客画像"
      testid="stats-audience"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint="按访客数排序;地区取 WP Statistics 存档的 location 国家码(未知统一归入「未知」)。"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-2">
            <SubTitle>{g.label}</SubTitle>
            <ShareList items={g.items} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** 热门页面 Top(存档浏览量排行) */
export function StatsTopPagesPanel({
  topPages,
  archiveLastDate,
  className,
}: {
  topPages: { uri: string; type: string; hits: number; share: number }[];
  archiveLastDate: string | null;
  className?: string;
}) {
  const max = Math.max(1, ...topPages.map((p) => p.hits));
  return (
    <Panel
      className={className}
      title="热门页面 Top"
      testid="stats-top-pages"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint="按区间内浏览量排序(存档口径,URI 为旧站路径)。"
    >
      {topPages.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无数据。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {topPages.map((p, i) => (
            <li key={`${p.uri}-${p.type}`} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-[12px] text-[#6482a3]">{i + 1}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-[#dcebf7]">
                {p.uri}
              </code>
              <span className="hidden shrink-0 rounded bg-[#1d3252] px-1.5 py-0.5 text-[10.5px] text-[#93b2ce] sm:inline">
                {p.type}
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-[12.5px] text-[#dcebf7]">
                {p.hits.toLocaleString("zh-CN")}
              </span>
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[#1d3252]">
                <span
                  className="block h-full rounded-full bg-[#6fb7e0]/70"
                  style={{ width: `${Math.max(3, (p.hits / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 访客时段分布(24 小时) */
export function StatsHourlyPanel({
  hourly,
  archiveLastDate,
  className,
}: {
  hourly: { hour: number; count: number }[];
  archiveLastDate: string | null;
  className?: string;
}) {
  const byHour = new Map(hourly.map((h) => [h.hour, h.count]));
  const points = Array.from({ length: 24 }, (_, h) => ({
    label: h % 3 === 0 ? `${h}时` : "",
    tip: `${h}:00–${h + 1}:00`,
    value: byHour.get(h) ?? 0,
  }));
  const peak = hourly.reduce(
    (best, h) => (h.count > best.count ? h : best),
    { hour: 0, count: 0 },
  );
  return (
    <Panel
      className={className}
      title="访客时段分布"
      testid="stats-hourly"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint={
        peak.count > 0
          ? `按最后一次访问的小时统计,高峰在 ${peak.hour}:00–${peak.hour + 1}:00。`
          : "按最后一次访问的小时统计。"
      }
    >
      <ColumnChart points={points} valueLabel="访客" />
    </Panel>
  );
}

/** 搜索引擎与外部引荐 */
export function StatsSearchEnginePanel({
  acquisition,
  archiveLastDate,
  className,
}: {
  acquisition: {
    engines: NamedCount[];
    directCount: number;
    referrers: NamedCount[];
    terms: { term: string; count: number }[];
  };
  archiveLastDate: string | null;
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="搜索引擎与外部引荐"
      testid="stats-search-engines"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint="搜索引擎为存档 source_name;外部引荐为非搜索引擎的引荐域名,已排除自家站点。"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <SubTitle>搜索引擎</SubTitle>
          <ShareList items={acquisition.engines} />
        </div>
        <div className="flex flex-col gap-2">
          <SubTitle>外部引荐域名</SubTitle>
          <ShareList items={acquisition.referrers} />
        </div>
      </div>
    </Panel>
  );
}

/** 搜索词 Top(从搜索引擎引荐 URL 的查询参数解析) */
export function StatsSearchTermsPanel({
  terms,
  archiveLastDate,
  className,
}: {
  terms: { term: string; count: number }[];
  archiveLastDate: string | null;
  className?: string;
}) {
  const max = Math.max(1, ...terms.map((t) => t.count));
  return (
    <Panel
      className={className}
      title="搜索词 Top"
      testid="stats-search-terms"
      actions={<ArchiveBadge lastDate={archiveLastDate} />}
      hint="从搜索引擎引荐链接的查询参数解析(百度 wd / 多数引擎 q);已过滤字母+数字混排的随机串型垃圾词。"
    >
      {terms.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无可解析的搜索词。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {terms.map((t) => (
            <li key={t.term} className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#c4d9ec]">{t.term}</span>
              <span className="w-14 shrink-0 text-right font-mono text-[12.5px] text-[#dcebf7]">
                {t.count.toLocaleString("zh-CN")}
              </span>
              <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[#1d3252]">
                <span
                  className="block h-full rounded-full bg-[#e8c877]/70"
                  style={{ width: `${Math.max(3, (t.count / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function spiderTone(code: string): "ok" | "warn" | "danger" | "muted" {
  if (code === "200") return "ok";
  if (code === "404") return "warn";
  if (code === "500" || code === "504") return "danger";
  return "muted";
}

/** 百度蜘蛛抓取(状态码分布 + 404 URL) */
export function StatsSpiderPanel({
  spider,
  className,
}: {
  spider: {
    statuses: { code: string; count: number }[];
    top404: { url: string; count: number }[];
    lastCrawl: string | null;
  };
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="百度蜘蛛抓取"
      testid="stats-spider"
      hint="来自百度 SEO 插件的蜘蛛日志;抓取量按同 URL/IP 聚合次数计。"
    >
      {spider.statuses.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无数据。</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {spider.statuses.map((s) => (
              <Badge key={s.code} tone={spiderTone(s.code)}>
                {s.code}: {s.count.toLocaleString("zh-CN")}
              </Badge>
            ))}
          </div>
          {spider.lastCrawl && (
            <p className="text-[11.5px] text-[#6482a3]">最近抓取:{spider.lastCrawl}</p>
          )}
          {spider.top404.length > 0 && (
            <div className="flex flex-col gap-2">
              <SubTitle>蜘蛛命中的 404 URL</SubTitle>
              <ShareList
                items={spider.top404.map((r) => ({ name: r.url, count: r.count }))}
                mono
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
