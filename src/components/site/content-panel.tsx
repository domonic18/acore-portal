import type { ReactNode } from "react";

/**
 * 内容区深色面板(ardot p02/p09):页面背景图为全站装饰层,
 * 正文区域必须有自身底色,避免文字直接压在背景图上。
 * 与用户中心 account-shell 同款圆角/描边,全站内容页复用。
 */
export function ContentPanel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="content-panel"
      className={`rounded-2xl border border-[#22385a] bg-[#0d1a2e]/95 ${className}`}
    >
      {children}
    </div>
  );
}
