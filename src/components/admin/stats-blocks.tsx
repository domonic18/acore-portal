import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/**
 * 统计看板区块(与 app/admin/stats/page.tsx 拆分配套;components 禁 import server,
 * 结构类型与 services/stats/dashboard·traffic·sales 返回同形)。
 * data-testid 落在 Card 渲染的 section 上(E2E stats-* 断言依赖)。
 */
type OnlineData = { source: string; current: number };
type ArticleTopItem = { slug: string; title: string; views: number };
type SalesItem = { productId: string; name: string; sku: string; soldQty: number; revenue: number };
type SalesData = { totalUnits: number; top: SalesItem[] };
type NotFoundItem = { path: string; count: number };
type TradeData = { orders7d: { count: number; pointsSpent: number }; users7d: { newRegistered: number } };
type TrendData = { points: { date: string; uv: number; pv: number }[]; totalUv: number; totalPv: number };
type NamedCount = { name: string; count: number };
type SourceData = { sources: NamedCount[]; devices: NamedCount[]; platforms: NamedCount[] };
type SpiderData = {
  statuses: { code: string; count: number }[];
  top404: { url: string; count: number }[];
  lastCrawl: string | null;
};
type FunnelData = { productView: number; addCart: number; order: number; viewToCart: number; cartToOrder: number };
type PageViewData = {
  pv: number;
  uv: number;
  topPages: { path: string; count: number; share: number }[];
};

/** 区块外壳:Card(即 section)+ CardHeader,testid 落 section */
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
    <Card data-testid={testid} className="text-[13px]">
      <CardHeader title={title} />
      <div className="flex flex-col gap-2 p-4 text-[#93b2ce]">{children}</div>
    </Card>
  );
}

const EMPTY = "暂无数据。";

/** 数值高亮 / 列表行弱化序号(小助手) */
function Strong({ children }: { children: React.ReactNode }) {
  return <span className="text-lg font-bold text-[#dcebf7]">{children}</span>;
}
function Rank({ n }: { n: number }) {
  return <span className="w-5 text-right text-[#6482a3]">{n}.</span>;
}

export function StatsOnlineBlock({ online }: { online: OnlineData }) {
  return (
    <Block title="今日在线" testid="stats-online">
      <p>
        当前在线 <Strong>{online.current}</Strong>
        {online.source === "degraded" && (
          <Badge tone="warn" className="ml-2">
            数据延迟
          </Badge>
        )}
      </p>
    </Block>
  );
}

export function StatsArticleTopBlock({ items }: { items: ArticleTopItem[] }) {
  return (
    <Block title="文章阅读 Top 10" testid="stats-article-top">
      {items.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((a, i) => (
            <li key={a.slug} className="flex items-center gap-2">
              <Rank n={i + 1} />
              <span className="min-w-0 flex-1 truncate text-[#dcebf7]">{a.title}</span>
              <span>{a.views}</span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}

export function StatsProductSalesBlock({
  sales,
  salesRange,
}: {
  sales: SalesData;
  salesRange: "30d" | "all";
}) {
  const tabCls = (active: boolean) =>
    `rounded border px-2 py-0.5 text-xs transition ${FOCUS_RING} ${
      active
        ? "border-[#22385a] bg-[#13233a] text-[#dcebf7]"
        : "border-transparent text-[#93b2ce] hover:text-[#dcebf7]"
    }`;
  return (
    <Block title="商品销量 Top 10" testid="stats-product-sales">
      <div className="flex items-center gap-3 text-xs">
        <Link href="/admin/stats?sales=30d" className={tabCls(salesRange === "30d")}>
          近 30 天
        </Link>
        <Link href="/admin/stats" className={tabCls(salesRange === "all")}>
          累计
        </Link>
        <span className="text-[#6482a3]">共售出 {sales.totalUnits} 件</span>
      </div>
      {sales.top.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {sales.top.map((s, i) => (
            <li key={s.productId} className="flex items-center gap-2">
              <Rank n={i + 1} />
              <span className="min-w-0 flex-1 truncate text-[#dcebf7]">
                {s.name}
                <span className="ml-2 font-mono text-xs text-[#6482a3]">{s.sku}</span>
              </span>
              <span className="w-16 text-right">{s.soldQty} 件</span>
              <span className="w-24 text-right text-[#e8c877]">{s.revenue} 积分</span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}

export function StatsNotFoundTopBlock({ items }: { items: NotFoundItem[] }) {
  return (
    <Block title="404 路径 Top 10(近 7 日)" testid="stats-notfound-top">
      {items.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {items.map((n) => (
            <li key={n.path} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-[#dcebf7]">{n.path}</code>
              <span>{n.count}</span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}

export function StatsTradeBlock({ data }: { data: TradeData }) {
  return (
    <Block title="近 7 天交易与注册" testid="stats-trade">
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt>订单数</dt>
          <dd>
            <Strong>{data.orders7d.count}</Strong>
          </dd>
        </div>
        <div>
          <dt>积分消耗</dt>
          <dd>
            <Strong>{data.orders7d.pointsSpent}</Strong>
          </dd>
        </div>
        <div>
          <dt>新注册</dt>
          <dd>
            <Strong>{data.users7d.newRegistered}</Strong>
          </dd>
        </div>
      </dl>
    </Block>
  );
}

export function StatsTrafficTrendBlock({ trend }: { trend: TrendData }) {
  const lastDay = trend.points[trend.points.length - 1];
  const trendMaxPv = Math.max(1, ...trend.points.map((p) => p.pv));
  return (
    <Block title="流量趋势(近 30 日)" testid="stats-traffic-trend">
      {trend.points.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <>
          <p>
            UV 合计 <Strong>{trend.totalUv}</Strong>
            <span className="ml-4">
              PV 合计 <Strong>{trend.totalPv}</Strong>
            </span>
          </p>
          <div className="flex h-16 items-end gap-0.5">
            {trend.points.map((p) => (
              <div
                key={p.date}
                title={`${p.date} · UV ${p.uv} / PV ${p.pv}`}
                className="flex-1 rounded-t bg-[#6fb7e0]/60"
                style={{
                  height: `${Math.max(2, Math.round((p.pv / trendMaxPv) * 100))}%`,
                }}
              />
            ))}
          </div>
          {lastDay && (
            <p className="text-xs text-[#6482a3]">
              最新:{lastDay.date} · UV {lastDay.uv} / PV {lastDay.pv}
            </p>
          )}
        </>
      )}
    </Block>
  );
}

const SOURCE_GROUPS = [
  { label: "来源 Top 10", key: "sources" as const },
  { label: "设备 Top 10", key: "devices" as const },
  { label: "平台 Top 10", key: "platforms" as const },
];

export function StatsTrafficSourceBlock({ source }: { source: SourceData }) {
  return (
    <Block title="访客来源 / 设备 / 平台" testid="stats-traffic-source">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SOURCE_GROUPS.map(({ label, key }) => {
          const rows = source[key];
          return (
            <div key={label} className="flex flex-col gap-1">
              <h3 className="text-xs text-[#6482a3]">{label}</h3>
              {rows.length === 0 ? (
                <p className="text-[#6482a3]">{EMPTY}</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {rows.map((r) => (
                    <li key={r.name} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[#dcebf7]">{r.name}</span>
                      <span>{r.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </Block>
  );
}

function spiderBadgeTone(code: string): "ok" | "warn" | "danger" | "muted" {
  if (code === "200") return "ok";
  if (code === "404") return "warn";
  if (code === "500" || code === "504") return "danger";
  return "muted";
}

export function StatsSpiderBlock({ spider }: { spider: SpiderData }) {
  return (
    <Block title="百度蜘蛛抓取" testid="stats-spider">
      {spider.statuses.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {spider.statuses.map((s) => (
              <Badge key={s.code} tone={spiderBadgeTone(s.code)}>
                {s.code}: {s.count}
              </Badge>
            ))}
            {spider.lastCrawl && (
              <span className="text-[#6482a3]">最近抓取:{spider.lastCrawl}</span>
            )}
          </div>
          {spider.top404.length > 0 && (
            <>
              <h3 className="text-xs text-[#6482a3]">404 URL Top 10</h3>
              <ol className="flex flex-col gap-1">
                {spider.top404.map((r) => (
                  <li key={r.url} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate text-[#dcebf7]">{r.url}</code>
                    <span>{r.count}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </Block>
  );
}

export function StatsFunnelBlock({ funnel }: { funnel: FunnelData }) {
  return (
    <Block title="转化漏斗(24h)" testid="stats-funnel">
      <p>
        商品浏览 <Strong>{funnel.productView}</Strong>
      </p>
      <p>
        加入购物车 <Strong>{funnel.addCart}</Strong>
        <span className="ml-2 text-xs text-[#6482a3]">浏览转化 {funnel.viewToCart}%</span>
      </p>
      <p>
        下单 <Strong>{funnel.order}</Strong>
        <span className="ml-2 text-xs text-[#6482a3]">加购转化 {funnel.cartToOrder}%</span>
      </p>
    </Block>
  );
}

export function StatsPageViewBlock({ pageView }: { pageView: PageViewData }) {
  return (
    <Block title="页面访问(近 24h)" testid="stats-pageview">
      <p>
        PV <Strong>{pageView.pv}</Strong>
        <span className="ml-4">
          UV <Strong>{pageView.uv}</Strong>
        </span>
      </p>
      {pageView.topPages.length === 0 ? (
        <p className="text-[#6482a3]">{EMPTY}</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {pageView.topPages.map((p) => (
            <li key={p.path} className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate text-[#dcebf7]">{p.path}</code>
              <span>{p.count}</span>
              <span className="w-14 text-right text-xs text-[#6482a3]">{p.share}%</span>
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}
