"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SiteNavItem } from "@/constants/navigation";
import { UnreadBadge } from "@/components/site/unread-badge";

/**
 * 全站页头交互层(M3 US1 T018,R12;2026-10 ardot 设计稿 p01 对齐):
 * 深蓝页头 + 金色登录/注册 + 登录态积分 chip 与头像;
 * 桌面多级下拉 + 移动汉堡折叠(FR-205);当前路由高亮 #6fb7e0。
 */
export function SiteHeaderClient({
  items,
  portraitUrl,
  authed,
  points,
}: {
  items: readonly SiteNavItem[];
  portraitUrl: string;
  authed: boolean;
  points: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (item: SiteNavItem) => {
    if (!item.href) return false;
    if (item.href === "/") return pathname === "/";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const caret = (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="mt-0.5">
      <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-1 px-1 py-2 text-base transition-colors ${
      active ? "text-[#6fb7e0]" : "text-[#93b2ce] hover:text-[#6fb7e0]"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-[#35577f] bg-[#102035]/95 backdrop-blur">
      <div className="container-site flex h-16 items-center gap-8 lg:h-[72px]">
        <Link href="/" className="shrink-0" aria-label="老克塔首页">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="老克塔" width={116} height={46} className="h-10 w-auto lg:h-[46px]" />
        </Link>

        {/* 桌面导航 */}
        <nav aria-label="主导航" className="hidden flex-1 lg:block">
          <ul className="flex items-center gap-7">
            {items.map((item) => (
              <li key={item.label} className="group relative">
                {item.href ? (
                  <Link href={item.href} className={navLinkClass(isActive(item))}>
                    {item.label}
                    {item.children && caret}
                  </Link>
                ) : (
                  <span className={navLinkClass(false) + " cursor-pointer"}>
                    {item.label}
                    {item.children && caret}
                  </span>
                )}
                {item.children && (
                  <ul className="invisible absolute left-0 top-full z-50 min-w-44 rounded-lg border border-[#35577f] bg-[#0d1a2e] py-1.5 opacity-0 shadow-xl shadow-black/40 transition group-hover:visible group-hover:opacity-100">
                    {item.children.map((child) => (
                      <li key={child.label}>
                        <Link
                          href={child.href}
                          className="block px-4 py-2 text-[15px] text-[#93b2ce] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {authed ? (
            <>
              <UnreadBadge />
              <Link
                href="/account/points"
                data-testid="header-points"
                className="hidden items-center rounded-md border border-[#e8c877]/50 bg-[#e8c877]/10 px-2.5 py-1 text-sm font-semibold text-[#e8c877] hover:bg-[#e8c877]/20 sm:flex"
                title="积分明细"
              >
                {points} 积分
              </Link>
              <Link
                href="/account/overview"
                className="flex items-center overflow-hidden rounded-lg border border-[#35577f] hover:border-[#e8c877]/60"
                title="我的账户"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={portraitUrl}
                  alt="随机角色头像"
                  width={36}
                  height={36}
                  className="h-9 w-9 object-cover"
                />
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-3 text-[15px]">
              <Link href="/login" className="text-[#e8c877] hover:text-[#f5dc9a]">
                登 录
              </Link>
              <span className="text-[#6482a3]">|</span>
              <Link href="/register" className="text-[#e8c877] hover:text-[#f5dc9a]">
                注 册
              </Link>
            </div>
          )}

          {/* 移动汉堡 */}
          <button
            type="button"
            aria-label="菜单"
            aria-expanded={mobileOpen}
            data-testid="mobile-menu-button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md border border-[#35577f] p-2 text-[#93b2ce] hover:text-[#6fb7e0] lg:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              {mobileOpen ? (
                <path
                  d="M3 3l12 12M15 3L3 15"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 4.5h14M2 9h14M2 13.5h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 移动折叠面板(设计稿:抽屉式,二级菜单手风琴展开) */}
      {mobileOpen && (
        <nav
          aria-label="移动导航"
          data-testid="mobile-menu"
          className="border-t border-[#22385a] bg-[#0d1a2e] lg:hidden"
        >
          <ul className="container-site px-4 py-2 text-[15px]">
            {items.map((item) => (
              <li key={item.label} className="border-b border-[#1a2c47] last:border-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block py-2.5 text-[#c7d5e6]"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="block py-2.5 text-[#93b2ce]">{item.label}</span>
                )}
                {item.children && (
                  <ul className="pb-2 pl-4">
                    {item.children.map((child) => (
                      <li key={child.label}>
                        <Link
                          href={child.href}
                          className="block py-1.5 text-[#6fb7e0]"
                          onClick={() => setMobileOpen(false)}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
