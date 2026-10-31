import Link from "next/link";
import type { ReactNode } from "react";

/**
 * 区块标题(ardot 设计稿 sec-h 模式):金色竖条 + 标题 + 右侧元信息/更多链接。
 * 全站内容卡通用;meta 与 more 二选一或并存(more 靠右)。
 */
export function SectionHeader({
  title,
  meta,
  moreHref,
  moreLabel = "更多 →",
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  moreHref?: string;
  moreLabel?: string;
  className?: string;
}) {
  return (
    <div className={`mb-3 flex items-center gap-3 ${className}`}>
      <span className="sec-bar" aria-hidden="true" />
      <h2 className="text-xl font-bold text-[#dcebf7]">{title}</h2>
      {meta && <span className="text-[13px] text-[#6482a3]">{meta}</span>}
      {moreHref && (
        <Link
          href={moreHref}
          className="ml-auto text-[13px] text-[#6482a3] hover:text-[#6fb7e0]"
        >
          {moreLabel}
        </Link>
      )}
    </div>
  );
}
