"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { errorMessage, requestJson } from "@/lib/api-client";

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
      await requestJson(`/api/admin/orders/${orderId}/${kind}`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        {status === "delivery_failed" && (
          <Button
            type="button"
            variant="primary"
            disabled={busy !== null}
            onClick={() => act("redeliver")}
          >
            {busy === "redeliver" ? "补发中…" : "补发"}
          </Button>
        )}
        {(status === "paid" || status === "delivery_failed" || status === "completed") && (
          <Button
            type="button"
            variant="danger"
            disabled={busy !== null}
            onClick={() => act("refund")}
          >
            {busy === "refund" ? "退款中…" : "退款"}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </div>
  );
}
