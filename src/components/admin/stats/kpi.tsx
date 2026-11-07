import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "./charts";

/**
 * 看板 KPI 计数卡(2026-11-07 数据看板重构):
 * 指标名 + 主数值 + 环比涨跌 + 迷你趋势线,统一后台深色令牌。
 * 环比为 null 表示上一周期无基线(无法计算),展示「—」而非 0%。
 */
export type KpiMetric = { value: number; prev: number; delta: number | null };

/** 色调 → 图例十六进制色(Sparkline 用) */
const TONE_HEX = {
  accent: "#6fb7e0",
  warn: "#e8c877",
  danger: "#eda9a9",
  ok: "#6ee7b7",
} as const;

function formatNumber(v: number): string {
  return v.toLocaleString("zh-CN");
}

export function KpiCard({
  label,
  metric,
  hint,
  icon,
  tone = "accent",
  spark,
  sparkColor,
  testid,
  hideDelta = false,
}: {
  label: string;
  metric: KpiMetric;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "accent" | "warn" | "danger" | "ok";
  spark?: number[];
  sparkColor?: string;
  testid?: string;
  /** 隐藏环比行(实时类指标无对比基线,如「当前在线」) */
  hideDelta?: boolean;
}) {
  const toneCls = {
    accent: "text-[#6fb7e0]",
    warn: "text-[#e8c877]",
    danger: "text-[#eda9a9]",
    ok: "text-[#6ee7b7]",
  }[tone];

  const { delta } = metric;
  const deltaTone =
    delta === null
      ? "text-[#6482a3]"
      : delta > 0
        ? "text-[#6ee7b7]"
        : delta < 0
          ? "text-[#eda9a9]"
          : "text-[#6482a3]";
  const DeltaIcon =
    delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      data-testid={testid}
      className="flex flex-col justify-between rounded-xl border border-[#22385a] bg-[#13233a] p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] text-[#6482a3]">{label}</span>
        {icon && (
          <span className={`shrink-0 [&>svg]:h-4.5 [&>svg]:w-4.5 ${toneCls}`}>{icon}</span>
        )}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className="text-[26px] leading-8 font-bold text-[#dcebf7]">
          {formatNumber(metric.value)}
        </span>
        {spark && spark.length > 1 && (
          <Sparkline values={spark} color={sparkColor ?? TONE_HEX[tone]} />
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
        {!hideDelta && (
          <span className={`inline-flex items-center gap-0.5 ${deltaTone}`}>
            <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {delta === null ? "环比 —" : `环比 ${delta > 0 ? "+" : ""}${delta}%`}
          </span>
        )}
        {hint && <span className="text-[#6482a3]">{hint}</span>}
      </div>
    </div>
  );
}
