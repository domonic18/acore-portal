import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Panel, ShareList, SubTitle } from "./parts";

/**
 * 业务类看板面板(2026-11-07 数据看板重构):
 * 转化漏斗 / 商品销量 / 页面访问 / 404 路径 / 文章阅读。
 * 结构类型与服务层 services/stats/funnel·sales·dashboard 返回同形。
 */

type FunnelData = {
  productView: number;
  addCart: number;
  order: number;
  viewToCart: number;
  cartToOrder: number;
};

type SalesData = {
  totalUnits: number;
  top: {
    productId: string;
    name: string;
    sku: string;
    soldQty: number;
    soldOrders: number;
    revenue: number;
  }[];
};

type PageViewData = {
  pv: number;
  uv: number;
  topPages: { path: string; count: number; share: number }[];
};

/** 转化漏斗:三级漏斗 + 逐步转化率 */
export function StatsFunnelPanel({
  funnel,
  className,
}: {
  funnel: FunnelData;
  className?: string;
}) {
  const steps = [
    { label: "商品浏览", value: funnel.productView, rate: null as string | null },
    { label: "加入购物车", value: funnel.addCart, rate: `${funnel.viewToCart}%` },
    { label: "提交订单", value: funnel.order, rate: `${funnel.cartToOrder}%` },
  ];
  const base = Math.max(1, steps[0]!.value);
  const colors = ["bg-[#6fb7e0]/70", "bg-[#6fb7e0]/55", "bg-[#e8c877]/60"];
  return (
    <Panel
      className={className}
      title="转化漏斗(近 24h)"
      testid="stats-funnel"
      hint="埋点口径:商品浏览 → 加入购物车 → 提交订单;右侧为相对上一环节的转化率。"
    >
      <ul className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3">
            <span className="w-[68px] shrink-0 text-[12.5px] text-[#93b2ce]">{s.label}</span>
            <span className="h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-[#1d3252]">
              <span
                className={`block h-full rounded-md ${colors[i]}`}
                style={{ width: `${Math.max(2, (s.value / base) * 100)}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[13px] text-[#dcebf7]">
              {s.value.toLocaleString("zh-CN")}
            </span>
            <span className="w-16 shrink-0 text-right text-[11.5px] text-[#6482a3]">
              {s.rate ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** 商品销量榜(区间口径) */
export function StatsSalesPanel({
  sales,
  salesRange,
  className,
}: {
  sales: SalesData;
  salesRange: "30d" | "all";
  className?: string;
}) {
  const max = Math.max(1, ...sales.top.map((s) => s.soldQty));
  return (
    <Panel
      className={className}
      title="商品销量榜"
      testid="stats-product-sales"
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/admin/stats?sales=30d"
            className={`rounded-full border px-2.5 py-0.5 text-[12px] transition ${
              salesRange === "30d"
                ? "border-[#6fb7e0] bg-[#6fb7e0]/15 font-medium text-[#a8d9f5]"
                : "border-[#22385a] text-[#93b2ce] hover:text-[#dcebf7]"
            }`}
          >
            近 30 天
          </Link>
          <Link
            href="/admin/stats"
            className={`rounded-full border px-2.5 py-0.5 text-[12px] transition ${
              salesRange === "all"
                ? "border-[#6fb7e0] bg-[#6fb7e0]/15 font-medium text-[#a8d9f5]"
                : "border-[#22385a] text-[#93b2ce] hover:text-[#dcebf7]"
            }`}
          >
            累计
          </Link>
        </div>
      }
      hint={`共售出 ${sales.totalUnits.toLocaleString("zh-CN")} 件(不含取消/退款订单)。`}
    >
      {sales.top.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无数据。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sales.top.map((s, i) => (
            <li key={s.productId} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-[12px] text-[#6482a3]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#dcebf7]">
                {s.name}
                <span className="ml-2 font-mono text-[11px] text-[#6482a3]">{s.sku}</span>
              </span>
              <span className="w-16 shrink-0 text-right text-[12.5px] text-[#93b2ce]">
                {s.soldQty} 件
              </span>
              <span className="w-20 shrink-0 text-right font-mono text-[12.5px] text-[#e8c877]">
                {s.revenue.toLocaleString("zh-CN")} 分
              </span>
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-[#1d3252]">
                <span
                  className="block h-full rounded-full bg-[#e8c877]/60"
                  style={{ width: `${Math.max(3, (s.soldQty / max) * 100)}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 页面访问(自建埋点,近 24h) */
export function StatsPageViewPanel({
  pageView,
  className,
}: {
  pageView: PageViewData;
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="页面访问(近 24h)"
      testid="stats-pageview"
      hint="自建埋点:访客标识为 IP + 当日盐哈希(不留原始 IP),跨日重新计数。"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[#1d3252]/60 px-3 py-2">
          <div className="text-[11.5px] text-[#6482a3]">浏览量 PV</div>
          <div className="text-xl font-bold text-[#dcebf7]">
            {pageView.pv.toLocaleString("zh-CN")}
          </div>
        </div>
        <div className="rounded-lg bg-[#1d3252]/60 px-3 py-2">
          <div className="text-[11.5px] text-[#6482a3]">访客数 UV</div>
          <div className="text-xl font-bold text-[#dcebf7]">
            {pageView.uv.toLocaleString("zh-CN")}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SubTitle>访问最多的页面</SubTitle>
        <ShareList
          items={pageView.topPages.map((p) => ({ name: p.path, count: p.count }))}
          mono
        />
      </div>
    </Panel>
  );
}

/** 404 路径 Top(近 7 日,Redis 采集) */
export function StatsNotFoundPanel({
  items,
  className,
}: {
  items: { path: string; count: number }[];
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="404 路径 Top(近 7 日)"
      testid="stats-notfound-top"
      hint="由全局 404 页上报采集,按日写入 Redis 计数。"
    >
      <ShareList items={items.map((n) => ({ name: n.path, count: n.count }))} mono />
    </Panel>
  );
}

/** 文章阅读 Top(站内文章自建阅读数) */
export function StatsArticleTopPanel({
  items,
  className,
}: {
  items: { slug: string; title: string; views: number }[];
  className?: string;
}) {
  return (
    <Panel
      className={className}
      title="文章阅读 Top"
      testid="stats-article-top"
      hint="按站内文章累计阅读数排序(仅已发布)。"
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无数据。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a, i) => (
            <li key={a.slug} className="flex items-center gap-2.5">
              <span className="w-5 shrink-0 text-right text-[12px] text-[#6482a3]">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-[#c4d9ec]">{a.title}</span>
              <Badge tone="muted">{a.views.toLocaleString("zh-CN")}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
