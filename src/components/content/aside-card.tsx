import type { ReactNode } from "react";

/** 内容页右栏卡片(ardot p04):蓝竖条卡头 + 深色面板;列表分割线由使用方控制 */
export function ContentAsideCard({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      data-testid={testId ?? `aside-${title}`}
      className="rounded-xl border border-line bg-panel p-5"
    >
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-num">
        <span
          aria-hidden="true"
          className="h-[15px] w-[5px] shrink-0 rounded-full bg-accent"
        />
        {title}
      </h2>
      {children}
    </section>
  );
}
