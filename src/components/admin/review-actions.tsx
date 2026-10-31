"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * D3 复核操作(T062):通过→订单 completed/驳回→cancelled;
 * 可填备注入审计;二次确认,成功 router.refresh。
 * 用 onClick 直传意图,不依赖 form submitter(React 委托监听下不可靠)。
 */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(approve: boolean) {
    if (
      !window.confirm(
        approve
          ? "确认通过复核?该存量单将落为 completed。"
          : "确认驳回?该存量单将落为 cancelled。",
      )
    )
      return;
    setBusy(approve ? "approve" : "reject");
    setError(null);
    try {
      const res = await fetch(`/api/admin/review-items/${reviewId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "复核失败,请稍后重试。");
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="备注(可选,入审计)"
        className="w-48 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 placeholder-gray-500"
      />
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => act(true)}
        className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
      >
        {busy === "approve" ? "通过中…" : "通过"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => act(false)}
        className="rounded bg-gray-700 px-3 py-1 text-xs font-semibold text-gray-200 hover:bg-gray-600 disabled:opacity-50"
      >
        {busy === "reject" ? "驳回中…" : "驳回"}
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
