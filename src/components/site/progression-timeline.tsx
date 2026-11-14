import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";

/**
 * 渐进时间轴渲染(前后台共用):轴线 + 左右交替卡片位 + 节点图标/日期。
 * 前台只读、后台就地编辑都复用同一套布局,保证「在渲染基础上编辑」。
 * 卡片内容由调用方以 ReactNode 注入(前台 article / 后台可编辑卡)。
 */
export type ProgressionNodeState = "current" | "open" | "locked";

/** 日期口径:存 UTC 零点的 Date 或 yyyy-MM-dd 字符串 → 源站「2023年1月1日」 */
export function formatPhaseDate(value: Date | string | null): string {
  if (!value) return "未定档";
  const [y, m, d] = formatDate(value).split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}

export function ProgressionNodeIcon({ state }: { state: ProgressionNodeState }) {
  const cls =
    state === "current"
      ? "border-highlight bg-highlight text-page"
      : state === "open"
        ? "border-danger-strong bg-danger-strong text-ink"
        : "border-line-strong bg-panel-inset text-body";
  return (
    <span
      className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 lg:h-10 lg:w-10 ${cls}`}
      aria-hidden="true"
    >
      {state === "locked" ? (
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 lg:h-5 lg:w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 lg:h-5 lg:w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M6.5 12.5l3.5 3.5 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export type ProgressionTimelineItem = {
  key: string;
  anchorId?: string;
  state: ProgressionNodeState;
  dateLabel: string;
  card: ReactNode;
};

export function ProgressionTimeline({ items }: { items: ProgressionTimelineItem[] }) {
  return (
    <div className="relative mt-8 pb-2">
      {/* 轴线:移动端居左,桌面居中;源站为绯红渐变细线 */}
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-[12px] top-0 w-[2px] bg-[linear-gradient(to_bottom,transparent_0%,var(--theme-danger-strong)_10%,var(--theme-danger-strong)_90%,transparent_100%)] lg:left-1/2 lg:w-[3px] lg:-translate-x-1/2"
      />
      <ol className="space-y-6 lg:space-y-8">
        {items.map((item, i) => {
          const cardRight = i % 2 === 0;
          return (
            <li
              key={item.key}
              id={item.anchorId}
              className="relative scroll-mt-24 pl-10 lg:grid lg:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)] lg:pl-0"
            >
              <div className="absolute left-0 top-6 flex w-[27px] justify-center lg:hidden">
                <ProgressionNodeIcon state={item.state} />
              </div>

              {/* 日期:桌面置于卡片对侧,移动端在卡片内 */}
              <div
                className={
                  cardRight
                    ? "hidden lg:col-start-1 lg:row-start-1 lg:flex lg:justify-end lg:pr-7 lg:pt-7"
                    : "hidden lg:col-start-3 lg:row-start-1 lg:flex lg:justify-start lg:pl-7 lg:pt-7"
                }
              >
                <span className="whitespace-nowrap text-[14px] text-foreground">
                  {item.dateLabel}
                </span>
              </div>

              {/* 中心节点图标(桌面) */}
              <div className="hidden lg:col-start-2 lg:row-start-1 lg:flex lg:justify-center lg:pt-8">
                <ProgressionNodeIcon state={item.state} />
              </div>

              <div
                className={
                  cardRight
                    ? "min-w-0 lg:col-start-3 lg:row-start-1 lg:pl-7"
                    : "min-w-0 lg:col-start-1 lg:row-start-1 lg:pr-7"
                }
              >
                {item.card}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
