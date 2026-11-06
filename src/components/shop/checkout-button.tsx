"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { errorMessage, requestJson } from "@/lib/api-client";

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
      const body = await requestJson<{ orderId?: string }>("/api/checkout", { method: "POST" });
      if (!body.orderId) {
        setError("结算失败,请稍后重试。");
        return;
      }
      router.push(`/account/orders/${body.orderId}`);
      // 同布局的页头积分 chip 需随扣分重取(issue #29)
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
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
        className="rounded-md bg-accent px-6 py-2 font-semibold text-page hover:bg-link disabled:cursor-not-allowed disabled:bg-line disabled:text-body"
      >
        {submitting ? "结算中…" : `确认支付 ${total} 积分`}
      </button>
    </div>
  );
}
