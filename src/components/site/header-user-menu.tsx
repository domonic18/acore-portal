"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserAvatar } from "@/components/site/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * 页头账户菜单(#84 从 header-client 拆出):头像按钮 + 下拉菜单 + 登出。
 * Radix DropdownMenu 底座:外点/Esc 关闭、方向键导航与 aria 态由底座接管。
 * 积分显示在菜单顶部(2026-11-05 从页头 chip 收敛至此)。
 * 头像为名字缩略图(与账号总览同口径),非随机角色图(2026-11-09 用户反馈)。
 */
export function HeaderUserMenu({
  avatarName,
  points,
  isAdmin,
}: {
  avatarName: string;
  points: number;
  isAdmin: boolean;
}) {
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const itemClass =
    "h-auto w-full justify-start rounded-md px-4 py-2 text-[15px] text-body data-[highlighted]:bg-panel data-[highlighted]:text-link";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu-button"
        aria-label="账户菜单"
        className="flex items-center rounded-full border border-line-strong hover:border-highlight/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <UserAvatar name={avatarName} className="h-9 w-9 text-base" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        data-testid="user-menu"
        className="w-44"
      >
        <div
          data-testid="menu-points"
          className="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span className="text-body">积分</span>
          <span className="font-semibold text-highlight">{points}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/account/overview">用户中心</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/account/points">积分明细</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/account/orders">我的订单</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClass}>
          <Link href="/account/settings">账户设置</Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild className={itemClass}>
            <Link href="/admin" data-testid="menu-admin-entry">
              进入后台
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          asChild
          disabled={loggingOut}
          className={`${itemClass} text-highlight data-[highlighted]:text-highlight-strong`}
        >
          <button
            type="button"
            data-testid="logout-button"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "正在退出…" : "退出登录"}
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
