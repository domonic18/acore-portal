import Link from "next/link";
import { ADMIN_NAV_GROUPS } from "@/constants/navigation";
import { NavIcon } from "@/components/admin/nav-icons";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

type FlatNavItem = { readonly href: string; readonly label: string; readonly icon?: string };

/** 仪表盘快捷入口(全量后台导航网格,带 lucide 图标) */
export function DashboardQuickLinks() {
  const items: readonly FlatNavItem[] = ADMIN_NAV_GROUPS.flatMap(
    (g) => g.items as readonly FlatNavItem[],
  );
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {items
        .filter((item) => item.href !== "/admin")
        .map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={`flex flex-col items-center gap-1.5 rounded-xl border border-[#22385a] bg-[#13233a] px-2 py-3 text-center text-[12px] text-[#93b2ce] transition hover:border-[#6fb7e0]/40 hover:text-[#dcebf7] ${FOCUS_RING}`}
          >
            <NavIcon icon={item.icon} className="h-4.5 w-4.5 text-[#6fb7e0]" />
            {item.label}
          </Link>
        ))}
    </div>
  );
}
