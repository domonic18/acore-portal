import { THREAD_STATUS_LABEL } from "@/constants/forum";

const STATUS_TONE = {
  standard: "border-highlight/30 bg-highlight/12 text-highlight",
  resolved: "border-ok/35 bg-ok/12 text-ok-text",
  closed: "border-body/30 bg-body/15 text-body",
} as const;

/** 主题徽标:状态标签(Q3)+置顶;closed 双表达时以 closedAt 为准(契约) */
export function ThreadStatusBadge({
  statusLabel,
  closedAt,
}: {
  statusLabel: "none" | "standard" | "resolved" | "closed";
  closedAt: Date | null;
}) {
  const key = closedAt ? "closed" : statusLabel;
  const label = THREAD_STATUS_LABEL[key];
  if (!label || key === "none") return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] leading-none ${STATUS_TONE[key]}`}
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
