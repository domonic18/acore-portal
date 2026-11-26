"use client";

import Link from "next/link";
import { useState } from "react";
import type { SiteNavItem } from "@/constants/navigation";
import { UnreadBadge } from "@/components/site/unread-badge";
import { HeaderDesktopNav, HeaderMobileNav } from "@/components/site/header-nav";
import { HeaderUserMenu } from "@/components/site/header-user-menu";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

/**
 * 全站页头交互层(M3 US1 T018,R12;2026-10 ardot 设计稿 p01 对齐):
 * 深蓝页头 + 金色登录/注册 + 登录态通知铃与头像(积分在头像下拉内,2026-11-05 收敛);
 * 搜索入口 = 右上角搜索 ICON(2026-11-18 用户反馈,主导航不再放「搜索」文字项);
 * 桌面多级下拉 + 移动侧边抽屉(FR-205,Radix 承担遮罩/滚动锁定/Esc)。
 * 职责拆分(#84):导航见 header-nav、账户菜单见 header-user-menu,本文件只做外壳与编排。
 * 页头背景图与配色由 .site-header 类 + <html> 上的主题变量驱动(2026-11-06 主题系统)。
 */
export function SiteHeaderClient({
  items,
  avatarName,
  authed,
  isAdmin,
  points,
  logoUrl,
}: {
  items: readonly SiteNavItem[];
  avatarName: string;
  authed: boolean;
  isAdmin: boolean;
  points: number;
  logoUrl: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="site-header sticky top-0 z-40 border-b border-line-strong">
        <div className="container-site flex h-16 items-center gap-8 lg:h-[88px]">
          <Link href="/" className="shrink-0" aria-label="老克塔首页">
            {/* 800×313 生产原图(WP 原版 Logo 迁移),64px 显示高倍屏不糊 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="老克塔"
              width={800}
              height={313}
              className="h-11 w-auto lg:h-[64px]"
            />
          </Link>

          <HeaderDesktopNav items={items} />

          <div className="ml-auto flex items-center gap-4">
            <a
              href="/search"
              title="搜索"
              aria-label="搜索"
              data-testid="header-search-link"
              className="rounded-full border border-line-muted p-2 text-foreground transition-colors hover:border-highlight-deep hover:text-highlight-soft"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <path d="m14 14-3.4-3.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </a>
            {authed ? (
              <>
                <UnreadBadge />
                <HeaderUserMenu
                  avatarName={avatarName}
                  points={points}
                  isAdmin={isAdmin}
                />
              </>
            ) : (
              <div className="flex items-center gap-3 text-[15px]">
                <Link href="/login" className="text-highlight hover:text-highlight-strong">
                  登 录
                </Link>
                <span className="text-muted">|</span>
                <Link href="/register" className="text-highlight hover:text-highlight-strong">
                  注 册
                </Link>
              </div>
            )}

            {/* 移动汉堡(抽屉触发器;展开态图标由 mobileOpen 派生) */}
            <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
              <DrawerTrigger
                asChild
                data-testid="mobile-menu-button"
                className="rounded-md border border-line-strong p-2 text-body hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 lg:hidden"
              >
                <button type="button" aria-label="菜单">
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
              </DrawerTrigger>
              <DrawerContent
                data-testid="mobile-menu"
                aria-describedby={undefined}
                className="w-72 max-w-[85vw] border-line bg-panel-strong shadow-xl shadow-black/40"
              >
                <DrawerTitle className="sr-only">导航菜单</DrawerTitle>
                <HeaderMobileNav items={items} onClose={() => setMobileOpen(false)} />
              </DrawerContent>
            </Drawer>
          </div>
        </div>
      </header>
    </>
  );
}
