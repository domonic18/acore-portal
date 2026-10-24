import { THREAD_STATUS_LABEL } from "@/constants/forum";

/** 主题徽标:状态标签(Q3)+置顶;closed 双表达时以 closedAt 为准(契约) */
export function ThreadStatusBadge({
  statusLabel,
  closedAt,
}: {
  statusLabel: "none" | "standard" | "resolved" | "closed";
  closedAt: Date | null;
}) {
  const label = closedAt ? THREAD_STATUS_LABEL.closed : THREAD_STATUS_LABEL[statusLabel];
  if (!label) return null;
  const tone =
    label === "已关闭"
      ? "border-[#5d3a3a] text-[#d99a9a]"
      : label === "已解决"
        ? "border-[#3a5d45] text-[#9ad9ae]"
        : "border-[#5d553a] text-[#d9cd9a]";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs ${tone}`}>【{label}】</span>
  );
}

export function PinnedBadge() {
  return (
    <span className="rounded border border-[#5d4a1e] bg-[#5d4a1e]/30 px-1.5 py-0.5 text-xs text-[#e6d8a8]">
      置顶
    </span>
  );
}
