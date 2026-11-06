import { requireAdmin } from "@/server/session-guard";
import { getDashboard } from "@/server/services/stats/dashboard";
import { getProductSales } from "@/server/services/stats/sales";
import {
  getSpiderSummary,
  getTrafficSource,
  getTrafficTrend,
  type SpiderSummary,
  type TrafficSourceData,
  type TrafficTrendData,
} from "@/server/services/stats/traffic";
import { StatsRefresh } from "@/components/admin/stats-refresh";
import {
  StatsArticleTopBlock,
  StatsFunnelBlock,
  StatsNotFoundTopBlock,
  StatsOnlineBlock,
  StatsPageViewBlock,
  StatsProductSalesBlock,
  StatsSpiderBlock,
  StatsTradeBlock,
  StatsTrafficSourceBlock,
  StatsTrafficTrendBlock,
} from "@/components/admin/stats-blocks";

/**
 * 统计看板(US4 T027,FR-313,quickstart S4):多区块+手动刷新;
 * 页面访问区块读自建 page_view_event 采集(替代已下线的 umami);
 * 流量/SEO 三区块(二期)读 wp_legacy 存档,独立容错(无存档→「暂无数据」,不拖垮整页)。
 * 区块 UI 见 components/admin/stats-blocks.tsx(stats-* testid 落各 section)。
 */
export const dynamic = "force-dynamic";

const EMPTY_TREND: TrafficTrendData = { points: [], totalUv: 0, totalPv: 0 };
const EMPTY_SOURCE: TrafficSourceData = { sources: [], devices: [], platforms: [] };
const EMPTY_SPIDER: SpiderSummary = { statuses: [], top404: [], lastCrawl: null };

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: { sales?: string };
}) {
  await requireAdmin();
  const salesRange = searchParams.sales === "30d" ? "30d" : "all";
  const [data, sales, trend, source, spider] = await Promise.all([
    getDashboard(),
    getProductSales({
      limit: 10,
      since:
        salesRange === "30d"
          ? new Date(Date.now() - 30 * 24 * 3600 * 1000)
          : undefined,
    }),
    getTrafficTrend().catch(() => EMPTY_TREND),
    getTrafficSource().catch(() => EMPTY_SOURCE),
    getSpiderSummary().catch(() => EMPTY_SPIDER),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">统计看板</h1>
        <StatsRefresh />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatsOnlineBlock online={data.online} />
        <StatsArticleTopBlock items={data.articleTop} />
        <StatsProductSalesBlock sales={sales} salesRange={salesRange} />
        <StatsNotFoundTopBlock items={data.notFoundTop} />
        <StatsTradeBlock
          data={{ orders7d: data.orders7d, users7d: data.users7d }}
        />
        <StatsTrafficTrendBlock trend={trend} />
        <StatsTrafficSourceBlock source={source} />
        <StatsSpiderBlock spider={spider} />
        <StatsFunnelBlock funnel={data.funnel} />
        <StatsPageViewBlock pageView={data.pageView} />
      </div>
    </div>
  );
}
