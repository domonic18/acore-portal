"use client";

import { usePathname } from "next/navigation";

/** 后台是独立控制台(p12 设计稿):/admin* 不渲染门户页头页脚 */
export function HideOnAdmin({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
