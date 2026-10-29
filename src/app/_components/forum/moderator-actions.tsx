"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { THREAD_LABEL_OPTIONS, THREAD_STATUS_LABEL } from "@/constants/forum";

/**
 * 版主操作条(T040,FR-220):仅 moderator/admin 服务端渲染可见;
 * 全部走 /api/forum/moderate/thread/[id]/*,成功后 refresh(审计在服务端落)。
 */
export function ModeratorActions({
  threadId,
  pinned,
  closed,
  statusLabel,
  boardSlug,
}: {
  threadId: string;
  pinned: boolean;
  closed: boolean;
  statusLabel: "none" | "standard" | "resolved" | "closed";
  boardSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, method: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/forum/moderate/thread/${threadId}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.error?.message ?? "操作失败,请稍后重试。");
        return false;
      }
      return true;
    } catch {
      setError("网络异常,请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, method: string, body?: object) {
    if (await request(path, method, body)) router.refresh();
  }

  async function remove() {
    if (!window.confirm("确认删除该主题?楼层将一并隐藏(数据保留)。")) return;
    if (await request("", "DELETE")) router.push(`/forum/${boardSlug}`);
  }

  const btn =
    "rounded-lg border px-2.5 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#22385a] bg-[#1b2f4c] px-3.5 py-2.5 text-xs">
      <span className="font-medium text-[#6482a3]">版主操作：</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/pin", "POST", { pinned: !pinned })}
        className={`${btn} border-[#5d4a1e] text-[#e6d8a8] hover:bg-[#5d4a1e]/30`}
      >
        {pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/close", "POST", { closed: !closed })}
        className={`${btn} border-[#5d553a] text-[#d9cd9a] hover:bg-[#5d553a]/30`}
      >
        {closed ? "重开主题" : "关闭主题"}
      </button>
      <label className="flex items-center gap-1 text-[#8fa0b8]">
        状态标签
        <select
          disabled={busy || closed}
          value={closed ? "closed" : statusLabel}
          onChange={(e) => act("/label", "POST", { label: e.target.value })}
          className="rounded border border-[#3a4a63] bg-[#101827] px-1 py-1 text-[#c7d2e0]"
        >
          {closed ? (
            <option value="closed">{THREAD_STATUS_LABEL.closed}</option>
          ) : (
            THREAD_LABEL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {THREAD_STATUS_LABEL[v] || "无"}
              </option>
            ))
          )}
        </select>
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className={`${btn} ml-auto border-[#5d3a3a] text-[#d99a9a] hover:bg-[#5d3a3a]/30`}
      >
        删除
      </button>
      {error && <span className="w-full text-[#d99a9a]">{error}</span>}
    </div>
  );
}
