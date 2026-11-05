"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 页头账户菜单(#84 从 header-client 拆出):头像按钮 + 下拉菜单 + 登出;
 * 点击外部/Esc 关闭菜单。积分显示在菜单顶部(2026-11-05 从页头 chip 收敛至此)。
 */
export function HeaderUserMenu({
  portraitUrl,
  points,
  isAdmin,
}: {
  portraitUrl: string;
  points: number;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const itemClass =
    "block w-full px-4 py-2 text-left text-[15px] text-[#93b2ce] hover:bg-[#13233a] hover:text-[#6fb7e0]";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="user-menu-button"
        aria-label="账户菜单"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center overflow-hidden rounded-lg border border-[#35577f] hover:border-[#e8c877]/60"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl}
          alt="随机角色头像"
          width={36}
          height={36}
          className="h-9 w-9 object-cover"
        />
      </button>
      {open && (
        <div
          role="menu"
          data-testid="user-menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-[#35577f] bg-[#0d1a2e] py-1.5 shadow-xl shadow-black/40"
        >
          <div
            data-testid="menu-points"
            className="flex items-center justify-between border-b border-[#22385a] px-4 py-2 text-sm"
          >
            <span className="text-[#93b2ce]">积分</span>
            <span className="font-semibold text-[#e8c877]">{points}</span>
          </div>
          <Link
            role="menuitem"
            href="/account/overview"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            用户中心
          </Link>
          <Link
            role="menuitem"
            href="/account/points"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            积分明细
          </Link>
          <Link
            role="menuitem"
            href="/account/orders"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            我的订单
          </Link>
          <Link
            role="menuitem"
            href="/account/settings"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            账户设置
          </Link>
          {isAdmin && (
            <Link
              role="menuitem"
              href="/admin"
              data-testid="menu-admin-entry"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              进入后台
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            data-testid="logout-button"
            disabled={loggingOut}
            onClick={logout}
            className={`${itemClass} border-t border-[#22385a] text-[#e8c877] hover:text-[#f5dc9a] disabled:opacity-60`}
          >
            {loggingOut ? "正在退出…" : "退出登录"}
          </button>
        </div>
      )}
    </div>
  );
}
