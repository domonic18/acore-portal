"use client";

import { useEffect, useState } from "react";
import { useUnreadCount } from "@/lib/use-unread-count";
import { UNREAD_TOAST_MS } from "@/constants/notification";

/**
 * 站点页头未读徽标+弹泡(FR-310,契约 api-notification 弹泡口径):
 * 轮询取数在 useUnreadCount Hook(issue #85 展示层无 IO),本组件只负责渲染:
 * count 增长才弹 toast(点击跳收件箱);仅登录态渲染(header authed 分支)。
 */
export function UnreadBadge() {
  const { count, delta } = useUnreadCount();
  const [toast, setToast] = useState<number | null>(null);

  useEffect(() => {
    if (delta <= 0) return;
    setToast(delta);
  }, [delta]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), UNREAD_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <a
        href="/account/notifications"
        title="通知"
        aria-label={`通知,未读 ${count ?? 0} 条`}
        data-testid="unread-badge"
        className="relative rounded-full border border-[#243350] p-2 text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 1.5a4 4 0 0 0-4 4v2.6L2.7 10.7c-.3.5.1 1.3.7 1.3h9.2c.6 0 1-.8.7-1.3L12 8.1V5.5a4 4 0 0 0-4-4ZM6.5 13a1.5 1.5 0 0 0 3 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {count !== null && count > 0 && (
          <span
            data-testid="unread-count"
            className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </a>
      {toast !== null && (
        <button
          type="button"
          data-testid="unread-toast"
          onClick={() => {
            window.location.href = "/account/notifications";
          }}
          className="fixed right-4 top-16 z-50 rounded border border-[#c9a227] bg-[#16233a] px-4 py-2 text-sm text-[#e6d8a8] shadow-lg"
        >
          你有 {toast} 条新通知,点击查看
        </button>
      )}
    </>
  );
}
