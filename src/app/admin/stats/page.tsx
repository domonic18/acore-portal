import Link from "next/link";
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

/**
 * 统计看板(US4 T027,FR-313/SC-306,quickstart S4):六区块+手动刷新;
 * 流量/SEO 三区块(二期)读 wp_legacy 存档,独立容错(无存档→「暂无数据」,不拖垮整页);
 * Umami 区块独立容错(未配置/失败→「暂不可用」,不拖垮整页)。
 */
export const dynamic = "force-dynamic";

const EMPTY_TREND: TrafficTrendData = { points: [], totalUv: 0, totalPv: 0 };
const EMPTY_SOURCE: TrafficSourceData = { sources: [], devices: [], platforms: [] };
const EMPTY_SPIDER: SpiderSummary = { statuses: [], top404: [], lastCrawl: null };

function statusBadge(code: string): string {
  const base = "rounded px-1.5 py-0.5";
  if (code === "200") return `${base} bg-emerald-900/40 text-emerald-300`;
  if (code === "404") return `${base} bg-amber-900/40 text-amber-300`;
  if (code === "500" || code === "504") return `${base} bg-red-900/40 text-red-300`;
  return `${base} bg-gray-800 text-gray-300`;
}

function Block({
  title,
  testid,
  children,
}: {
  title: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-testid={testid}
      className="flex flex-col gap-2 rounded border border-gray-800 p-4 text-sm"
    >
      <h2 className="font-semibold text-gray-200">{title}</h2>
      {children}
    </section>
  );
}

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
  const lastDay = trend.points[trend.points.length - 1];
  const trendMaxPv = Math.max(1, ...trend.points.map((p) => p.pv));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">统计看板</h1>
        <StatsRefresh />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Block title="今日在线" testid="stats-online">
          <p className="text-gray-400">
            当前在线{" "}
            <span className="text-lg font-bold text-gray-100">
              {data.online.current}
            </span>
            {data.online.source === "degraded" && (
              <span className="ml-2 rounded bg-amber-900/40 px-1.5 py-0.5 text-xs text-amber-300">
                数据延迟
              </span>
            )}
          </p>
        </Block>

        <Block title="文章阅读 Top 10" testid="stats-article-top">
          {data.articleTop.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <ol className="flex flex-col gap-1 text-gray-400">
              {data.articleTop.map((a, i) => (
                <li key={a.slug} className="flex items-center gap-2">
                  <span className="w-5 text-right text-gray-600">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-gray-300">
                    {a.title}
                  </span>
                  <span>{a.views}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="商品销量 Top 10" testid="stats-product-sales">
          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/admin/stats?sales=30d"
              className={
                salesRange === "30d"
                  ? "rounded bg-gray-800 px-2 py-0.5 text-gray-100"
                  : "text-gray-400 hover:text-gray-200"
              }
            >
              近 30 天
            </Link>
            <Link
              href="/admin/stats"
              className={
                salesRange === "all"
                  ? "rounded bg-gray-800 px-2 py-0.5 text-gray-100"
                  : "text-gray-400 hover:text-gray-200"
              }
            >
              累计
            </Link>
            <span className="text-gray-500">
              共售出 {sales.totalUnits} 件
            </span>
          </div>
          {sales.top.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <ol className="flex flex-col gap-1 text-gray-400">
              {sales.top.map((s, i) => (
                <li key={s.productId} className="flex items-center gap-2">
                  <span className="w-5 text-right text-gray-600">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-gray-300">
                    {s.name}
                    <span className="ml-2 font-mono text-xs text-gray-600">
                      {s.sku}
                    </span>
                  </span>
                  <span className="w-16 text-right">{s.soldQty} 件</span>
                  <span className="w-24 text-right text-amber-400">
                    {s.revenue} 积分
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="404 路径 Top 10(近 7 日)" testid="stats-notfound-top">
          {data.notFoundTop.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <ol className="flex flex-col gap-1 text-gray-400">
              {data.notFoundTop.map((n) => (
                <li key={n.path} className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate text-gray-300">
                    {n.path}
                  </code>
                  <span>{n.count}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block title="近 7 天交易与注册" testid="stats-trade">
          <dl className="grid grid-cols-3 gap-2 text-gray-400">
            <div>
              <dt>订单数</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.orders7d.count}
              </dd>
            </div>
            <div>
              <dt>积分消耗</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.orders7d.pointsSpent}
              </dd>
            </div>
            <div>
              <dt>新注册</dt>
              <dd className="text-lg font-bold text-gray-100">
                {data.users7d.newRegistered}
              </dd>
            </div>
          </dl>
        </Block>

        <Block title="流量趋势(近 30 日)" testid="stats-traffic-trend">
          {trend.points.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <div className="flex flex-col gap-2 text-gray-400">
              <p>
                UV 合计{" "}
                <span className="text-lg font-bold text-gray-100">
                  {trend.totalUv}
                </span>
                <span className="ml-4">
                  PV 合计{" "}
                  <span className="text-lg font-bold text-gray-100">
                    {trend.totalPv}
                  </span>
                </span>
              </p>
              <div className="flex h-16 items-end gap-0.5">
                {trend.points.map((p) => (
                  <div
                    key={p.date}
                    title={`${p.date} · UV ${p.uv} / PV ${p.pv}`}
                    className="flex-1 rounded-t bg-sky-700/70"
                    style={{
                      height: `${Math.max(2, Math.round((p.pv / trendMaxPv) * 100))}%`,
                    }}
                  />
                ))}
              </div>
              {lastDay && (
                <p className="text-xs text-gray-500">
                  最新:{lastDay.date} · UV {lastDay.uv} / PV {lastDay.pv}
                </p>
              )}
            </div>
          )}
        </Block>

        <Block title="访客来源 / 设备 / 平台" testid="stats-traffic-source">
          <div className="grid grid-cols-1 gap-3 text-gray-400 sm:grid-cols-3">
            {[
              { label: "来源 Top 10", rows: source.sources },
              { label: "设备 Top 10", rows: source.devices },
              { label: "平台 Top 10", rows: source.platforms },
            ].map(({ label, rows }) => (
              <div key={label} className="flex flex-col gap-1">
                <h3 className="text-xs text-gray-500">{label}</h3>
                {rows.length === 0 ? (
                  <p className="text-gray-500">暂无数据。</p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {rows.map((r) => (
                      <li key={r.name} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-gray-300">
                          {r.name}
                        </span>
                        <span>{r.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        </Block>

        <Block title="百度蜘蛛抓取" testid="stats-spider">
          {spider.statuses.length === 0 ? (
            <p className="text-gray-500">暂无数据。</p>
          ) : (
            <div className="flex flex-col gap-2 text-gray-400">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {spider.statuses.map((s) => (
                  <span key={s.code} className={statusBadge(s.code)}>
                    {s.code}: {s.count}
                  </span>
                ))}
                {spider.lastCrawl && (
                  <span className="text-gray-500">
                    最近抓取:{spider.lastCrawl}
                  </span>
                )}
              </div>
              {spider.top404.length > 0 && (
                <>
                  <h3 className="text-xs text-gray-500">404 URL Top 10</h3>
                  <ol className="flex flex-col gap-1">
                    {spider.top404.map((r) => (
                      <li key={r.url} className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate text-gray-300">
                          {r.url}
                        </code>
                        <span>{r.count}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </Block>

        <Block title="Umami 流量(24h)" testid="stats-umami">
          {!data.umami.configured ? (
            <p className="text-gray-500">未接入 Umami(配置 umami 组后生效)。</p>
          ) : !data.umami.ok ? (
            <p className="text-gray-500" data-testid="stats-umami-error">
              Umami 暂不可用。
            </p>
          ) : (
            <div className="flex flex-col gap-2 text-gray-400">
              <p>
                PV{" "}
                <span className="text-lg font-bold text-gray-100">
                  {data.umami.pv24h}
                </span>
                <span className="ml-4">
                  UV{" "}
                  <span className="text-lg font-bold text-gray-100">
                    {data.umami.uv24h}
                  </span>
                </span>
              </p>
              {data.umami.topReferrers.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {data.umami.topReferrers.map((r) => (
                    <li key={r.domain} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-gray-300">
                        {r.domain}
                      </span>
                      <span>{r.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Block>
      </div>
    </div>
  );
}
