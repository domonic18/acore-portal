import type { ReactNode } from "react";

/** 侧栏卡片壳(T019 统一版式) */
export function SidebarCard({
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
      data-testid={testId ?? `sidebar-${title}`}
      className="rounded-xl border border-[#22385a] bg-[#13233a] p-5"
    >
      <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-semibold text-[#a8d9f5]">
        <span
          aria-hidden="true"
          className="h-[15px] w-[5px] shrink-0 rounded-full bg-[#5ea3cc]"
        />
        {title}
      </h2>
      {children}
    </section>
  );
}
