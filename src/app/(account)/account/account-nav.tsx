"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ACCOUNT_NAV } from "@/constants/navigation";

/**
 * 用户中心 tab 条(#63):9 项导肢单行不折行——移动端横向滚动
 * (snap+右缘渐隐提示+当前项滚入居中),桌面端一行平铺;
 * 当前路由下划线高亮 + aria-current(GitHub/Stripe 个人页 section tabs 模式)。
 */
export function AccountNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // block:"nearest" 防止带动整页纵向滚动;桌面不溢出时为 no-op
    activeRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="用户中心导航" data-testid="account-nav" className="relative">
      <ul
        className="flex snap-x gap-1 overflow-x-auto border-b border-line px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-3"
      >
        {ACCOUNT_NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0 snap-start first:ml-0">
              <Link
                ref={active ? activeRef : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
                  active ? "text-link" : "text-body hover:text-num"
                }`}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-link"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* 右缘渐隐提示可横向滚动;桌面一行放得下时隐藏 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-panel-strong to-transparent lg:hidden"
      />
    </nav>
  );
}
