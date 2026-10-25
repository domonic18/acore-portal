"use client";

import Link from "next/link";
import { useState } from "react";
import type { SiteNavItem } from "@/constants/navigation";
import { UnreadBadge } from "@/components/site/unread-badge";

/**
 * 全站页头交互层(M3 US1 T018,R12):桌面多级下拉 + 移动汉堡折叠(FR-205)。
 * 菜单数据由服务端按登录态过滤后下发(双菜单=同一数据源的过滤产物)。
 */
export function SiteHeaderClient({
  items,
  portraitUrl,
  authed,
}: {
  items: readonly SiteNavItem[];
  portraitUrl: string;
  authed: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLink = (item: SiteNavItem, className?: string) => {
    if (item.href) {
      return (
        <Link href={item.href} className={className}>
          {item.label}
        </Link>
      );
    }
    return <span className={className}>{item.label}</span>;
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#1e2a3d] bg-[#0a1220]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-semibold tracking-wide text-[#e6d8a8]">
            老克塔
          </span>
        </Link>

        {/* 桌面导航 */}
        <nav aria-label="主导航" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1 text-sm">
            {items.map((item) => (
              <li key={item.label} className="group relative">
                {navLink(
                  item,
                  "flex items-center gap-1 rounded px-3 py-2 text-[#c7d2e0] hover:bg-[#16233a] hover:text-[#e6d8a8]",
                )}
                {item.children && (
                  <ul className="invisible absolute left-0 top-full z-50 min-w-40 rounded border border-[#243350] bg-[#0d1728] py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
                    {item.children.map((child) => (
                      <li key={child.label}>
                        {child.m4 ? (
                          <span
                            title="M4 交付"
                            className="flex cursor-not-allowed items-center justify-between px-3 py-2 text-[#5d6b80]"
                          >
                            {child.label}
                            <span className="text-[10px]">即将开放</span>
                          </span>
                        ) : (
                          <Link
                            href={child.href}
                            className="block px-3 py-2 text-[#c7d2e0] hover:bg-[#16233a] hover:text-[#e6d8a8]"
                          >
                            {child.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {authed ? (
            <>
              <UnreadBadge />
              <Link
                href="/account/overview"
              className="flex items-center gap-2 rounded-full border border-[#243350] p-1 pr-3 hover:border-[#c9a227]"
              title="我的帐户"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={portraitUrl}
                alt="随机角色头像"
                width={28}
                height={28}
                className="rounded-full"
              />
              <span className="hidden text-xs text-[#c7d2e0] sm:inline">
                我的帐户
              </span>
            </Link>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/login"
                className="rounded border border-[#243350] px-3 py-1.5 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
              >
                登录
              </Link>
              <Link
                href="/register"
                className="rounded bg-[#c9a227] px-3 py-1.5 font-medium text-[#1a1408] hover:bg-[#dbb535]"
              >
                注册
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
            className="rounded border border-[#243350] p-2 text-[#c7d2e0] md:hidden"
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

      {/* 移动折叠面板 */}
      {mobileOpen && (
        <nav
          aria-label="移动导航"
          data-testid="mobile-menu"
          className="border-t border-[#1e2a3d] bg-[#0a1220] md:hidden"
        >
          <ul className="mx-auto max-w-6xl px-4 py-2 text-sm">
            {items.map((item) => (
              <li key={item.label} className="border-b border-[#14203a] last:border-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block py-2.5 text-[#c7d2e0]"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="block py-2.5 text-[#8fa0b8]">{item.label}</span>
                )}
                {item.children && (
                  <ul className="pb-2 pl-4">
                    {item.children.map((child) => (
                      <li key={child.label}>
                        {child.m4 ? (
                          <span className="flex items-center justify-between py-1.5 text-[#5d6b80]">
                            {child.label}
                            <span className="text-[10px]">即将开放</span>
                          </span>
                        ) : (
                          <Link
                            href={child.href}
                            className="block py-1.5 text-[#9fb6cc]"
                            onClick={() => setMobileOpen(false)}
                          >
                            {child.label}
                          </Link>
                        )}
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
