"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 订单详情操作(FR-129):补发(仅 delivery_failed)/退款(可退状态);
 * 二次确认后调 API,成功 router.refresh 展示新状态。
 */
export function OrderActions({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"redeliver" | "refund" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "redeliver" | "refund") {
    const label = kind === "redeliver" ? "补发" : "退款";
    if (!window.confirm(`确认对订单执行「${label}」?该操作会记入审计日志。`)) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${kind}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? `${label}失败,请稍后重试。`);
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(null);
    }
  }

  const btnCls =
    "rounded px-4 py-1.5 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {status === "delivery_failed" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("redeliver")}
            className={`${btnCls} bg-blue-600 text-white hover:bg-blue-500`}
          >
            {busy === "redeliver" ? "补发中…" : "补发"}
          </button>
        )}
        {(status === "paid" || status === "delivery_failed" || status === "completed") && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("refund")}
            className={`${btnCls} bg-red-700 text-white hover:bg-red-600`}
          >
            {busy === "refund" ? "退款中…" : "退款"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
