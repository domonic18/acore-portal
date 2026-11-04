import {
  ArrowRight,
  ClipboardList,
  ShoppingCart,
  Wallet,
  Wifi,
} from "lucide-react";

/** 漏斗摘要结构(与 services/stats/funnel.ConversionFunnel 同形;components 禁 import server) */
type FunnelSummary = {
  productView: number;
  addCart: number;
  order: number;
  viewToCart: number;
  cartToOrder: number;
};

function MiniCard({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#22385a] bg-[#13233a] px-4 py-3">
      <span className="shrink-0 text-[#6fb7e0] [&>svg]:h-4.5 [&>svg]:w-4.5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-6 text-[#dcebf7]">{value}</span>
        <span className="block whitespace-nowrap text-[11.5px] text-[#6482a3]">{label}</span>
        {hint && (
          <span className="mt-0.5 block whitespace-nowrap text-[11px] text-[#6482a3]/80">{hint}</span>
        )}
      </span>
    </div>
  );
}

/** 运营摘要行:近 7 日交易/新增用户/当前在线 + 转化漏斗摘要条(数据源 getDashboard) */
export function DashboardSummaryRow({
  orders7d,
  users7d,
  online,
  funnel,
}: {
  orders7d: { count: number; pointsSpent: number };
  users7d: { newRegistered: number };
  online: { source: string; current: number };
  funnel: FunnelSummary;
}) {
  const steps = [
    { label: "浏览", value: funnel.productView },
    { label: "加购", value: funnel.addCart, rate: `${funnel.viewToCart}%` },
    { label: "下单", value: funnel.order, rate: `${funnel.cartToOrder}%` },
  ];
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      <MiniCard
        icon={<ShoppingCart />}
        value={orders7d.count}
        label="近 7 日订单"
        hint={`消耗 ${orders7d.pointsSpent} 积分`}
      />
      <MiniCard icon={<Wallet />} value={users7d.newRegistered} label="近 7 日新注册" />
      <MiniCard
        icon={<Wifi />}
        value={online.current}
        label="当前在线"
        hint={online.source === "probe" ? "实时探针" : "降级估算"}
      />
      <div
        data-testid="admin-funnel-strip"
        className="flex flex-wrap items-center gap-x-1 gap-y-0.5 rounded-xl border border-[#22385a] bg-[#13233a] px-2.5 py-3 text-[11.5px]"
      >
        <ClipboardList aria-hidden="true" className="mr-0.5 h-4 w-4 shrink-0 text-[#6fb7e0]" />
        {steps.map((s, i) => (
          <span key={s.label} className="flex min-w-0 items-center">
            {i > 0 && <ArrowRight aria-hidden="true" className="mx-0.5 h-3 w-3 shrink-0 text-[#6482a3]" />}
            <span className="whitespace-nowrap text-[#93b2ce]">
              {s.label} <span className="font-bold text-[#dcebf7]">{s.value}</span>
              {s.rate && <span className="ml-0.5 text-[10px] text-[#6482a3]">({s.rate})</span>}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
