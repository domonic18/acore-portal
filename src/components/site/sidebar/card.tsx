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
      className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4"
    >
      <h2 className="mb-3 border-b border-[#1e2a3d] pb-2 text-sm font-medium text-[#e6d8a8]">
        {title}
      </h2>
      {children}
    </section>
  );
}
