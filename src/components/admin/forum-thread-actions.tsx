"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 后台主题行内操作(置顶/关闭/标签/删除/恢复):POST /api/admin/forum/threads/{id}
 * action 分发;删除需确认;成功 router.refresh。
 */
export function ForumThreadActions({
  threadId,
  pinned,
  closed,
  label,
  deleted,
}: {
  threadId: string;
  pinned: boolean;
  closed: boolean;
  label: string;
  deleted: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/forum/threads/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const resp = await res.json().catch(() => null);
        setError(resp?.error?.message ?? "操作失败,请稍后重试。");
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400 disabled:opacity-50";

  if (deleted) {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <button
          type="button"
          disabled={busy || !hydrated}
          className={`${btn} border-green-700 text-green-400 hover:border-green-500`}
          onClick={() => act({ action: "undelete" })}
        >
          恢复
        </button>
        {error && (
          <span role="alert" className="text-xs text-red-400">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={busy || !hydrated}
        className={btn}
        onClick={() => act({ action: "pin", pinned: !pinned })}
      >
        {pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        type="button"
        disabled={busy || !hydrated}
        className={btn}
        onClick={() => act({ action: "close", closed: !closed })}
      >
        {closed ? "开放" : "关闭"}
      </button>
      <select
        aria-label="状态标签"
        disabled={busy || !hydrated}
        value={label}
        onChange={(e) => act({ action: "label", label: e.target.value })}
        className="rounded border border-gray-600 bg-gray-900 px-1 py-1 text-xs text-gray-200 disabled:opacity-50"
      >
        <option value="none">无标签</option>
        <option value="standard">规范</option>
        <option value="resolved">已解决</option>
      </select>
      <button
        type="button"
        disabled={busy || !hydrated}
        className={`${btn} border-red-800 text-red-300 hover:border-red-500`}
        onClick={() => act({ action: "delete" }, `确认删除主题 #${threadId}?可在回收站恢复。`)}
      >
        删除
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
