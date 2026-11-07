"use client";

import { useMemo, useState } from "react";

/**
 * 后台看板图表原语(2026-11-07 数据看板重构):
 * 纯 SVG 手绘,不引第三方图表库(宪法 VII:禁止未论证的新依赖)。
 * 约定:viewBox 坐标系 + preserveAspectRatio,鼠标坐标按 rect 比例换算回 viewBox。
 */

/** 图表配色(沿用后台深色令牌) */
export const CHART_COLORS = {
  pv: "#6fb7e0",
  uv: "#e8c877",
  grid: "#22385a",
  axis: "#6482a3",
  text: "#93b2ce",
} as const;

/** 构成图分类色板 */
export const CATEGORY_COLORS = [
  "#6fb7e0",
  "#e8c877",
  "#6ee7b7",
  "#eda9a9",
  "#b39ddb",
  "#f0a868",
  "#7dd3fc",
  "#a3e635",
  "#f472b6",
  "#94a3b8",
] as const;

export type TrendPoint = { date: string; pv: number; uv: number };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const n = value / base;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * base;
}

function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

function areaPath(points: { x: number; y: number }[], baseline: number): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points)} L${last.x.toFixed(1)} ${baseline.toFixed(1)} L${first.x.toFixed(1)} ${baseline.toFixed(1)} Z`;
}

/**
 * 访问趋势:PV(面积+折线)与 UV(折线)双序列,含网格/坐标轴/悬停读数。
 */
export function TrendChart({
  points,
  height = 260,
}: {
  points: TrendPoint[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const W = 1000;
  const H = height;
  const PAD = { top: 14, right: 14, bottom: 26, left: 46 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    if (points.length === 0) return null;
    const max = niceMax(
      Math.max(1, ...points.map((p) => Math.max(p.pv, p.uv))),
    );
    const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
    const toX = (i: number) => PAD.left + i * stepX;
    const toY = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const pvPts = points.map((p, i) => ({ x: toX(i), y: toY(p.pv) }));
    const uvPts = points.map((p, i) => ({ x: toX(i), y: toY(p.uv) }));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
      y: PAD.top + plotH - r * plotH,
      label: Math.round(max * r).toLocaleString("zh-CN"),
    }));
    const labelEvery = Math.max(1, Math.ceil(points.length / 8));
    return { max, toX, toY, pvPts, uvPts, ticks, labelEvery };
  }, [points, plotW, plotH]);

  if (!model) {
    return (
      <div className="flex h-[180px] items-center justify-center text-[13px] text-[#6482a3]">
        暂无数据。
      </div>
    );
  }

  const active = hover !== null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label="页面浏览与访客趋势"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          const ratio = points.length > 1 ? (x - PAD.left) / plotW : 0;
          const idx = Math.round(ratio * (points.length - 1));
          setHover(idx >= 0 && idx < points.length ? idx : null);
        }}
      >
        <defs>
          <linearGradient id="stats-pv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.pv} stopOpacity="0.34" />
            <stop offset="100%" stopColor={CHART_COLORS.pv} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {model.ticks.map((t) => (
          <g key={t.label}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke={CHART_COLORS.grid}
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={t.y + 3.5}
              textAnchor="end"
              fontSize="11"
              fill={CHART_COLORS.axis}
            >
              {t.label}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % model.labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={model.toX(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill={CHART_COLORS.axis}
            >
              {p.date.slice(5)}
            </text>
          ) : null,
        )}

        <path d={areaPath(model.pvPts, PAD.top + plotH)} fill="url(#stats-pv-fill)" />
        <path
          d={linePath(model.pvPts)}
          fill="none"
          stroke={CHART_COLORS.pv}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d={linePath(model.uvPts)}
          fill="none"
          stroke={CHART_COLORS.uv}
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinejoin="round"
        />

        {hover !== null && (
          <g>
            <line
              x1={model.toX(hover)}
              x2={model.toX(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke={CHART_COLORS.axis}
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={model.toX(hover)}
              cy={model.toY(points[hover]!.pv)}
              r="4"
              fill={CHART_COLORS.pv}
            />
            <circle
              cx={model.toX(hover)}
              cy={model.toY(points[hover]!.uv)}
              r="4"
              fill={CHART_COLORS.uv}
            />
          </g>
        )}
      </svg>

      {active && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-[#22385a] bg-[#0b1526]/95 px-3 py-2 text-[12px] whitespace-nowrap text-[#dcebf7] shadow-lg"
          style={{ left: `${(model.toX(hover) / W) * 100}%` }}
        >
          <div className="text-[#93b2ce]">{active.date}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: CHART_COLORS.pv }}
            />
            浏览量 <b className="ml-1">{active.pv.toLocaleString("zh-CN")}</b>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: CHART_COLORS.uv }}
            />
            访客数 <b className="ml-1">{active.uv.toLocaleString("zh-CN")}</b>
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-4 text-[12px] text-[#93b2ce]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: CHART_COLORS.pv }} />
          浏览量 PV
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: CHART_COLORS.uv }}
          />
          访客数 UV
        </span>
      </div>
    </div>
  );
}

/** 构成环形图(含图例);单类目时画整环 */
export function DonutChart({
  items,
  size = 168,
  centerLabel,
  centerValue,
}: {
  items: { name: string; value: number }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = size / 2 - 6;
  const inner = r * 0.62;
  const c = size / 2;

  if (total <= 0) {
    return (
      <div className="flex items-center justify-center text-[13px] text-[#6482a3]">暂无数据。</div>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = items.map((item, i) => {
    const sweep = (item.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const large = sweep > Math.PI ? 1 : 0;
    const x1 = c + r * Math.cos(start);
    const y1 = c + r * Math.sin(start);
    const x2 = c + r * Math.cos(end);
    const y2 = c + r * Math.sin(end);
    const ix1 = c + inner * Math.cos(end);
    const iy1 = c + inner * Math.sin(end);
    const ix2 = c + inner * Math.cos(start);
    const iy2 = c + inner * Math.sin(start);
    const single = items.length === 1;
    const d = single
      ? `M${c - r} ${c} A${r} ${r} 0 1 1 ${c + r} ${c} A${r} ${r} 0 1 1 ${c - r} ${c} Z ` +
        `M${c - inner} ${c} A${inner} ${inner} 0 1 0 ${c + inner} ${c} A${inner} ${inner} 0 1 0 ${c - inner} ${c} Z`
      : `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${ix1} ${iy1} A${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
    return {
      key: item.name,
      d,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
      share: (item.value / total) * 100,
      item,
    };
  });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="构成占比"
        className="shrink-0"
      >
        {arcs.map((a) => (
          <path key={a.key} d={a.d} fill={a.color} fillRule="evenodd">
            <title>{`${a.item.name} ${a.item.value}`}</title>
          </path>
        ))}
        {centerValue && (
          <>
            <text
              x={c}
              y={c - 2}
              textAnchor="middle"
              fontSize="20"
              fontWeight="700"
              fill="#dcebf7"
            >
              {centerValue}
            </text>
            <text x={c} y={c + 14} textAnchor="middle" fontSize="11" fill={CHART_COLORS.axis}>
              {centerLabel ?? ""}
            </text>
          </>
        )}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: a.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[#c4d9ec]">{a.item.name}</span>
            <span className="text-[#93b2ce]">{a.item.value.toLocaleString("zh-CN")}</span>
            <span className="w-12 text-right text-[#6482a3]">{a.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 纵向柱状图(访客时段分布) */
export function ColumnChart({
  points,
  height = 150,
  valueLabel = "访客",
}: {
  points: { label: string; value: number; tip?: string }[];
  height?: number;
  valueLabel?: string;
}) {
  const W = 1000;
  const H = height;
  const PAD = { top: 10, right: 8, bottom: 20, left: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const slot = plotW / Math.max(1, points.length);
  const barW = Math.max(2, slot * 0.62);

  if (points.length === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-[13px] text-[#6482a3]">暂无数据。</div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={valueLabel}
    >
      {points.map((p, i) => {
        const h = (p.value / max) * plotH;
        const x = PAD.left + i * slot + (slot - barW) / 2;
        const y = PAD.top + plotH - h;
        return (
          <g key={`${i}-${p.label}`}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(1, h)}
              rx="2"
              fill={CHART_COLORS.pv}
              fillOpacity="0.75"
            >
              <title>{`${p.tip ?? p.label} · ${valueLabel} ${p.value}`}</title>
            </rect>
            {p.label && (
              <text
                x={x + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill={CHART_COLORS.axis}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** 迷你折线(KPI 卡片内嵌趋势) */
export function Sparkline({
  values,
  color = CHART_COLORS.pv,
  width = 108,
  height = 30,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => ({
    x: i * stepX,
    y: height - 2 - ((v - min) / span) * (height - 4),
  }));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={areaPath(pts, height)} fill={color} fillOpacity="0.12" />
      <path d={linePath(pts)} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
