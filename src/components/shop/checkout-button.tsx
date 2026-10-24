"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 结算提交(契约 POST /api/checkout):成功跳订单详情;错误映射用户话术(402/409/422/503)。
 */
export function CheckoutButton({ total, disabled }: { total: number; disabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const body = (await res.json().catch(() => null)) as
        | { orderId?: string; error?: { message?: string } }
        | null;
      if (res.ok && body?.orderId) {
        router.push(`/account/orders/${body.orderId}`);
        return;
      }
      setError(body?.error?.message ?? "结算失败,请稍后重试。");
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={disabled || submitting}
        className="rounded bg-blue-600 px-6 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
      >
        {submitting ? "结算中…" : `确认支付 ${total} 积分`}
      </button>
    </div>
  );
}
