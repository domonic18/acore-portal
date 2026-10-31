"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_GROUPS } from "@/constants/navigation";

/**
 * 后台外壳(ardot p12):232px 分组侧栏 + 58px 顶栏(面包屑/告警/管理员)+ 内容区。
 * 侧栏是 <header> 内 <nav>,保留 banner>navigation>link 的可访问结构;
 * 移动端侧栏折为横向滚动条目,内容区保持单列。
 */
type Item = { readonly href: string; readonly label: string };
type Group = { readonly label: string; readonly items: readonly Item[] };

function findCurrent(pathname: string): { group: Group; item: Item } {
  let best: { group: Group; item: Item } | null = null;
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      const hit =
        item.href === "/admin"
          ? pathname === "/admin"
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (hit && (!best || item.href.length > best.item.href.length)) {
        best = { group, item };
      }
    }
  }
  return best ?? { group: ADMIN_NAV_GROUPS[0], item: ADMIN_NAV_GROUPS[0].items[0] };
}

export function AdminShell({
  adminName,
  lowStock,
  deliveryFailed,
  children,
}: {
  adminName: string;
  lowStock: number;
  deliveryFailed: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const { group, item } = findCurrent(pathname);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[#081120] lg:min-h-screen lg:flex-row">
      <header className="shrink-0 border-b border-[#22385a] bg-[#0b1526] lg:sticky lg:top-0 lg:h-screen lg:w-[232px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:py-5">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4 lg:px-6 lg:pb-6 lg:pt-0">
          <span
            aria-hidden="true"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-[#e8c877]/40 bg-[#13233a] text-[13px] font-bold text-[#e8c877]"
          >
            克
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-[#dcebf7]">
              老克塔后台
            </span>
            <span className="mt-0.5 block truncate text-[10.5px] tracking-wide text-[#6482a3]">
              OPERATION CONSOLE · 仅管理员角色
            </span>
          </span>
        </div>

        <nav
          aria-label="后台导航"
          className="flex gap-1 overflow-x-auto px-3 pb-2 lg:block lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {ADMIN_NAV_GROUPS.map((g) => (
            <div key={g.label} className="lg:mt-2">
              <p className="hidden px-6 pb-2 pt-4 text-[11.5px] text-[#6482a3] lg:block">
                {g.label}
              </p>
              <ul className="flex gap-1 lg:block">
                {g.items.map((navItem) => {
                  const active =
                    navItem.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === navItem.href ||
                        pathname.startsWith(`${navItem.href}/`);
                  return (
                    <li key={navItem.href} className="shrink-0">
                      <Link
                        href={navItem.href}
                        aria-current={active ? "page" : undefined}
                        className={`group flex items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 py-2 text-[13px] transition lg:rounded-none lg:border-0 lg:border-l-2 lg:px-6 lg:py-[11px] lg:text-[14px] ${
                          active
                            ? "border-[#6fb7e0] bg-gradient-to-r from-[#6fb7e0]/15 to-transparent font-semibold text-[#a8d9f5] lg:border-l-[#6fb7e0]"
                            : "border-transparent text-[#93b2ce] hover:bg-[#13233a] hover:text-[#dcebf7] lg:border-l-transparent"
                        }`}
                      >
                        {navItem.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[58px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#22385a] px-4 lg:px-7">
          <nav aria-label="面包屑" className="flex items-center gap-2 text-[13px]">
            <span className="text-[#6482a3]">{group.label}</span>
            <span aria-hidden="true" className="text-[#6482a3]">
              /
            </span>
            <span className="text-[#dcebf7]">{item.label}</span>
          </nav>
          {lowStock > 0 && (
            <Link
              href="/admin/products?lowStock=1"
              className="rounded-full border border-[#e8c877]/30 bg-[#e8c877]/12 px-2.5 py-0.5 text-[11.5px] text-[#e8c877] hover:bg-[#e8c877]/20"
            >
              低库存 {lowStock}
            </Link>
          )}
          {deliveryFailed > 0 && (
            <Link
              href="/admin/orders?status=delivery_failed"
              className="rounded-full border border-[#eda9a9]/30 bg-[#eda9a9]/12 px-2.5 py-0.5 text-[11.5px] text-[#eda9a9] hover:bg-[#eda9a9]/20"
            >
              发货异常 {deliveryFailed}
            </Link>
          )}
          <span className="ml-auto hidden items-center gap-2 text-[13px] text-[#93b2ce] sm:flex">
            <span className="text-[#a8d9f5]">{adminName}</span>
            <span className="text-[#6482a3]">· 管理员 | 操作日志</span>
          </span>
        </div>

        <main className="flex flex-1 flex-col gap-5 px-4 py-4 lg:px-7 lg:py-5">
          {children}
        </main>
      </div>
    </div>
  );
}
