import { THREAD_STATUS_LABEL } from "@/constants/forum";

const STATUS_TONE = {
  standard: "border-[#e8c877]/30 bg-[#e8c877]/12 text-[#e8c877]",
  resolved: "border-[#57b87d]/35 bg-[#57b87d]/12 text-[#8ad896]",
  closed: "border-[#93b2ce]/30 bg-[#93b2ce]/15 text-[#93b2ce]",
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
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-[3px] text-[11px] leading-none ${STATUS_TONE[key]}`}
    >
      【{label}】
    </span>
  );
}

export function PinnedBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-[#e8c877]/30 bg-[#e8c877]/12 px-2 py-[3px] text-[11px] leading-none text-[#e8c877]">
      置顶
    </span>
  );
}
