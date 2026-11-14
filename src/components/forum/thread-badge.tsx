import {
  THREAD_STATUS_LABEL,
  type ThreadStatusLabelValue,
} from "@/constants/forum";

const STATUS_TONE: Partial<Record<ThreadStatusLabelValue, string>> = {
  resolved: "border-ok/35 bg-ok/12 text-ok-text",
  needs_info: "border-warn/35 bg-warn/12 text-warn",
  closed: "border-body/30 bg-body/15 text-body",
};

/**
 * 主题徽标:状态标签(Q3)+置顶 +加精;
 * closed 双表达时以 closedAt 为准(契约:closed_at 与 status_label=closed 同写)
 */
export function ThreadStatusBadge({
  statusLabel,
  closedAt,
}: {
  statusLabel: ThreadStatusLabelValue;
  closedAt: Date | null;
}) {
  const key = closedAt ? "closed" : statusLabel;
  const label = THREAD_STATUS_LABEL[key];
  if (!label || key === "none") return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] leading-none ${STATUS_TONE[key] ?? ""}`}
    >
      【{label}】
    </span>
  );
}

export function PinnedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-highlight/30 bg-highlight/12 px-2 py-[3px] text-[11px] leading-none text-highlight">
      置顶
    </span>
  );
}

/** 加精徽标:版主精选,标题前显示「精」 */
export function FeaturedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-highlight-strong/50 bg-highlight-strong/15 px-2 py-[3px] text-[11px] font-medium leading-none text-highlight-strong">
      精
    </span>
  );
}
