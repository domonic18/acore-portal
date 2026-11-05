"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { SiteNavItem } from "@/constants/navigation";
import { UnreadBadge } from "@/components/site/unread-badge";
import { HeaderDesktopNav, HeaderMobileNav } from "@/components/site/header-nav";
import { HeaderUserMenu } from "@/components/site/header-user-menu";

/**
 * 全站页头交互层(M3 US1 T018,R12;2026-10 ardot 设计稿 p01 对齐):
 * 深蓝页头 + 金色登录/注册 + 登录态积分 chip 与头像;
 * 桌面多级下拉 + 移动侧边抽屉(FR-205)。
 * 职责拆分(#84):导航见 header-nav、账户菜单见 header-user-menu,本文件只做外壳与编排。
 */
export function SiteHeaderClient({
  items,
  portraitUrl,
  authed,
  points,
  logoUrl,
  headerBackgroundUrl,
}: {
  items: readonly SiteNavItem[];
  portraitUrl: string;
  authed: boolean;
  points: number;
  logoUrl: string;
  headerBackgroundUrl: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  // 页头背景图(后台可配):轻蒙层保导航可读同时透出原站场景图
  // (WP 原站页头无蒙层直出背景画,100px 高;0.6 对齐其观感)
  const headerStyle: CSSProperties | undefined = headerBackgroundUrl
    ? {
        backgroundImage: `linear-gradient(rgba(16, 32, 53, 0.6), rgba(16, 32, 53, 0.6)), url("${headerBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : undefined;

  // #55:移动菜单展开时锁定底层页面滚动,滚动只发生在抽屉面板内;Esc 关抽屉
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-[#35577f] bg-[#102035]/95 backdrop-blur"
        style={headerStyle}
      >
        <div className="container-site flex h-16 items-center gap-8 lg:h-[88px]">
          <Link href="/" className="shrink-0" aria-label="老克塔首页">
            {/* 800×313 生产原图(WP 原版 Logo 迁移),54px 显示高倍屏不糊 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="老克塔"
              width={800}
              height={313}
              className="h-10 w-auto lg:h-[54px]"
            />
          </Link>

          <HeaderDesktopNav items={items} />

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
                <HeaderUserMenu portraitUrl={portraitUrl} />
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
      </header>

      {mobileOpen && (
        <HeaderMobileNav items={items} onClose={() => setMobileOpen(false)} />
      )}
    </>
  );
}
