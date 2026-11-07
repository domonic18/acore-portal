import { Eye, Globe2, ShoppingCart, UserPlus, Users } from "lucide-react";
import { requireAdmin } from "@/server/session-guard";
import { getDashboard } from "@/server/services/stats/dashboard";
import { getProductSales } from "@/server/services/stats/sales";
import { getSpiderSummary } from "@/server/services/stats/traffic";
import { getStatsOverview } from "@/server/services/stats/overview";
import { parseStatsRange, STATS_RANGE_DAYS } from "@/constants/stats";
import { StatsRefresh } from "@/components/admin/stats-refresh";
import { KpiCard } from "@/components/admin/stats/kpi";
import {
  StatsAcquisitionPanel,
  StatsAudiencePanel,
  StatsHourlyPanel,
  StatsSearchEnginePanel,
  StatsSearchTermsPanel,
  StatsSpiderPanel,
  StatsTopPagesPanel,
  StatsTrendPanel,
} from "@/components/admin/stats/panels-traffic";
import {
  StatsArticleTopPanel,
  StatsFunnelPanel,
  StatsNotFoundPanel,
  StatsPageViewPanel,
  StatsSalesPanel,
} from "@/components/admin/stats/panels-business";

/**
 * 统计看板(2026-11-07 重构:仿 WP Statistics 后台,按行业看板布局重做):
 * KPI 概览行(带环比) → 访问趋势(区间切换) → 来源构成 / 访客画像 → 热门页面 / 时段分布
 * → 搜索引擎与引荐 / 搜索词 / 爬虫 → 转化漏斗 / 商品销量 → 页面访问 / 404 / 文章阅读。
 *
 * 数据两代并存:WP Statistics 存档(截至 2026-10-23,提供画像/获客/搜索词等历史维度)
 * + 自建 page_view_event 埋点(2026-10-24 起,提供当前趋势与页面访问),两者合并成一条时间线。
 * 存档侧查询失败(生产未导入存档)自动降级为空值,不拖垮整页。
 */
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: { range?: string; sales?: string };
}) {
  await requireAdmin();
  const range = parseStatsRange(searchParams.range);
  const salesRange = searchParams.sales === "30d" ? "30d" : "all";
  const rangeDays = STATS_RANGE_DAYS[range];
  const rangeStart = rangeDays
    ? new Date(Date.now() - rangeDays * DAY_MS)
    : new Date(0);

  const [overview, data, sales, spider] = await Promise.all([
    getStatsOverview(range),
    getDashboard(),
    getProductSales({
      limit: 10,
      since:
        salesRange === "30d" ? new Date(Date.now() - 30 * DAY_MS) : undefined,
    }),
    getSpiderSummary({ since: rangeStart }).catch(() => ({
      statuses: [],
      top404: [],
      lastCrawl: null,
    })),
  ]);

  const pvSpark = overview.timeline.map((p) => p.pv);
  const uvSpark = overview.timeline.map((p) => p.uv);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-[#dcebf7]">统计看板</h1>
          <p className="mt-0.5 text-[12.5px] text-[#6482a3]">
            流量画像取自 WP Statistics 存档(截至 {overview.archive.lastDate ?? "—"}),
            趋势与业务指标为自建埋点实时口径。
          </p>
        </div>
        <StatsRefresh />
      </div>

      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          testid="stats-kpi-online"
          label="当前在线"
          metric={{ value: data.online.current, prev: 0, delta: null }}
          icon={<Users />}
          tone="ok"
          hideDelta
          hint={data.online.source === "degraded" ? "数据延迟" : "实时探测"}
        />
        <KpiCard
          testid="stats-kpi-pv"
          label="页面浏览 PV"
          metric={overview.kpi.pv}
          icon={<Eye />}
          spark={pvSpark}
          hint={`${overview.rangeLabel}合计`}
        />
        <KpiCard
          testid="stats-kpi-uv"
          label="访客数 UV"
          metric={overview.kpi.uv}
          icon={<Globe2 />}
          tone="warn"
          spark={uvSpark}
          sparkColor="#e8c877"
          hint="按日去重后累加"
        />
        <KpiCard
          testid="stats-kpi-orders"
          label="订单数"
          metric={overview.kpi.orders}
          icon={<ShoppingCart />}
          hint={overview.rangeLabel}
        />
        <KpiCard
          testid="stats-kpi-points"
          label="积分消耗"
          metric={overview.kpi.points}
          tone="warn"
          hint={overview.rangeLabel}
        />
        <KpiCard
          testid="stats-kpi-users"
          label="新注册用户"
          metric={overview.kpi.users}
          icon={<UserPlus />}
          tone="ok"
          hint={overview.rangeLabel}
        />
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-12">
        <StatsTrendPanel
          className="xl:col-span-12"
          timeline={overview.timeline}
          bucketDays={overview.bucketDays}
          range={overview.range}
          archiveLastDate={overview.archive.lastDate}
        />

        <StatsAcquisitionPanel
          className="xl:col-span-5"
          acquisition={overview.acquisition}
          archiveLastDate={overview.archive.lastDate}
        />
        <StatsAudiencePanel
          className="xl:col-span-7"
          audience={overview.audience}
          archiveLastDate={overview.archive.lastDate}
        />

        <StatsTopPagesPanel
          className="xl:col-span-7"
          topPages={overview.topPages}
          archiveLastDate={overview.archive.lastDate}
        />
        <StatsHourlyPanel
          className="xl:col-span-5"
          hourly={overview.hourly}
          archiveLastDate={overview.archive.lastDate}
        />

        <StatsSearchEnginePanel
          className="xl:col-span-6"
          acquisition={overview.acquisition}
          archiveLastDate={overview.archive.lastDate}
        />
        <StatsSearchTermsPanel
          className="xl:col-span-3"
          terms={overview.acquisition.terms}
          archiveLastDate={overview.archive.lastDate}
        />
        <StatsSpiderPanel className="xl:col-span-3" spider={spider} />

        <StatsFunnelPanel className="xl:col-span-4" funnel={data.funnel} />
        <StatsSalesPanel
          className="xl:col-span-8"
          sales={sales}
          salesRange={salesRange}
        />

        <StatsPageViewPanel className="xl:col-span-4" pageView={data.pageView} />
        <StatsNotFoundPanel className="xl:col-span-4" items={data.notFoundTop} />
        <StatsArticleTopPanel className="xl:col-span-4" items={data.articleTop} />
      </div>
    </div>
  );
}
