"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 站点页头未读徽标+弹泡(FR-310,契约 api-notification 弹泡口径):
 * mount 拉基线(不弹),此后 60s 轮询;count 增长才弹 toast(点击跳收件箱);
 * 轮询失败静默(不打扰);仅登录态渲染(header authed 分支)。
 */
export function UnreadBadge() {
  const [count, setCount] = useState<number | null>(null);
  const [toast, setToast] = useState<number | null>(null);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/account/notifications/unread", {
          cache: "no-store",
        });
        if (!res.ok) return; // 失败静默
        const body = (await res.json()) as { count: number };
        if (!alive) return;
        const last = lastRef.current;
        if (last !== null && body.count > last) {
          setToast(body.count - last);
        }
        lastRef.current = body.count;
        setCount(body.count);
      } catch {
        // 静默
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    // 收件箱页已读操作后即时刷新(60s 轮询之外的旁路)
    const onChanged = () => void poll();
    window.addEventListener("ap:unread-changed", onChanged);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("ap:unread-changed", onChanged);
    };
  }, []);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 8_000);
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
