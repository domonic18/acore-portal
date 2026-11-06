"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { SiteNavItem } from "@/constants/navigation";

/**
 * 页头导航展示层(#84 从 header-client 拆出):
 * 桌面多级下拉 + 移动侧边抽屉;当前路由高亮(text-link);二级菜单手风琴默认折叠(#56)。
 */
export function isActivePath(pathname: string, item: SiteNavItem): boolean {
  if (!item.href) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const CARET = (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="mt-0.5">
    <path
      d="M2 3.5l3 3 3-3"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function navLinkClass(active: boolean) {
  return `flex items-center gap-1 rounded-md px-2.5 py-2 text-base transition-colors ${
    active
      ? "bg-link/10 text-link"
      : "text-body hover:bg-link/10 hover:text-num"
  }`;
}

export function HeaderDesktopNav({ items }: { items: readonly SiteNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="主导航" className="hidden flex-1 lg:block">
      <ul className="flex items-center gap-4">
        {items.map((item) => (
          <li key={item.label} className="group relative">
            {item.href ? (
              <Link href={item.href} className={navLinkClass(isActivePath(pathname, item))}>
                {item.label}
                {item.children && CARET}
              </Link>
            ) : (
              <span className={navLinkClass(false) + " cursor-pointer"}>
                {item.label}
                {item.children && CARET}
              </span>
            )}
            {item.children && (
              <ul className="invisible absolute left-0 top-full z-50 min-w-44 rounded-lg border border-line-strong bg-panel-strong py-1.5 opacity-0 shadow-xl shadow-black/40 transition group-hover:visible group-hover:opacity-100">
                {item.children.map((child) => (
                  <li key={child.label}>
                    <Link
                      href={child.href}
                      className="block px-4 py-2 text-[15px] text-body hover:bg-panel hover:text-link"
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
  );
}

/**
 * 移动抽屉(设计稿:侧边浮出;顶部展开会推挤页面导致跳动)。
 * 须渲染在 header 之外:header 的 backdrop-filter 会成为 fixed 子元素的
 * 包含块,遮罩会被压缩到页头高度;且 header z-40 栈上下文困住抽屉层级。
 * 面板自身限高滚动(overscroll-contain 防滚动链穿透到底层页面)。
 */
export function HeaderMobileNav({
  items,
  onClose,
}: {
  items: readonly SiteNavItem[];
  onClose: () => void;
}) {
  // #56:二级菜单手风琴,默认折叠,记录当前展开的分组
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  return (
    <>
      <div
        data-testid="mobile-menu-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 lg:hidden"
      />
      <nav
        aria-label="移动导航"
        data-testid="mobile-menu"
        className="fixed inset-y-0 right-0 z-[60] w-72 max-w-[85vw] overflow-y-auto overscroll-contain border-l border-line bg-panel-strong shadow-xl shadow-black/40 lg:hidden"
      >
        <ul className="px-4 py-3 text-[15px]">
          {items.map((item) => {
            const open = expandedGroup === item.label;
            return (
              <li key={item.label} className="border-b border-line-menu last:border-0">
                <div className="flex items-center justify-between gap-2">
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="min-w-0 flex-1 py-2.5 text-foreground"
                      onClick={onClose}
                    >
                      {item.label}
                    </Link>
                  ) : item.children ? (
                    <button
                      type="button"
                      className="min-w-0 flex-1 py-2.5 text-left text-body"
                      aria-expanded={open}
                      onClick={() => setExpandedGroup(open ? null : item.label)}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 py-2.5 text-body">{item.label}</span>
                  )}
                  {item.children && (
                    <button
                      type="button"
                      aria-label={`${open ? "收起" : "展开"}${item.label}子菜单`}
                      aria-expanded={open}
                      data-testid={`mobile-submenu-toggle-${item.label}`}
                      onClick={() => setExpandedGroup(open ? null : item.label)}
                      className="rounded-md p-2 text-body hover:text-link"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                        className={`transition-transform ${open ? "rotate-180" : ""}`}
                      >
                        <path
                          d="M2 3.5l3 3 3-3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                {item.children && open && (
                  <ul className="pb-2 pl-4">
                    {item.children.map((child) => (
                      <li key={child.label}>
                        <Link
                          href={child.href}
                          className="block py-1.5 text-link"
                          onClick={onClose}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
