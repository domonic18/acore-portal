"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { InboxItem } from "@/server/services/notification/inbox";

/**
 * 收件箱(契约 api-notification):服务端注入首页,加载更多走 cursor API;
 * 单条/全部已读本地即时更新(已读不可逆);无删除(M4)。
 */
export function InboxList({
  initial,
  initialCursor,
}: {
  initial: InboxItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account/notifications?cursor=${cursor}&limit=10`,
      );
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as {
        items: InboxItem[];
        nextCursor: string | null;
      };
      setItems((prev) => [...prev, ...body.items]);
      setCursor(body.nextCursor);
    } catch {
      setError("加载失败,请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function markOne(id: string) {
    const res = await fetch("/api/account/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, readAt: new Date().toISOString() } : i,
        ),
      );
      window.dispatchEvent(new CustomEvent("ap:unread-changed"));
    }
  }

  async function markAll() {
    const res = await fetch("/api/account/notifications/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? now })));
      window.dispatchEvent(new CustomEvent("ap:unread-changed"));
    }
  }

  const unread = items.filter((i) => i.readAt === null).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400" data-testid="inbox-unread">
          未读 {unread} 条
        </span>
        <button
          type="button"
          onClick={markAll}
          disabled={unread === 0}
          data-testid="mark-all-read"
          className="rounded border border-gray-700 px-3 py-1 text-sm disabled:opacity-40"
        >
          全部已读
        </button>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-gray-400">暂无通知。</p>
      ) : (
        <ul className="flex flex-col" data-testid="inbox-list">
          {items.map((i) => (
            <li
              key={i.id}
              data-testid="inbox-item"
              className={`flex flex-col gap-1 border-b border-gray-900 py-3 ${
                i.readAt === null ? "bg-gray-900/40" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                {!i.readAt && (
                  <span
                    aria-label="未读"
                    className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                  />
                )}
                <span
                  className={`text-sm font-medium ${
                    i.readAt === null ? "text-white" : "text-gray-400"
                  }`}
                >
                  {i.title}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  {formatDateTime(i.createdAt)}
                </span>
              </div>
              <p className="pl-4 text-sm text-gray-400">{i.body}</p>
              <div className="flex items-center gap-3 pl-4 text-xs">
                {i.linkUrl && (
                  <Link
                    href={i.linkUrl}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    查看详情
                  </Link>
                )}
                {i.readAt === null && (
                  <button
                    type="button"
                    onClick={() => markOne(i.id)}
                    className="text-gray-400 hover:text-gray-200"
                  >
                    标为已读
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          data-testid="load-more"
          className="rounded border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {loading ? "加载中…" : "加载更多"}
        </button>
      )}
    </div>
  );
}
