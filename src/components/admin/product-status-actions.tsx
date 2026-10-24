"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 商品行内上下架/目录隐藏(FR-127):POST /api/admin/products/[id]/status;
 * 下架不影响历史订单行快照。
 */
export function ProductStatusActions({
  productId,
  status,
  listed,
}: {
  productId: string;
  status: string;
  listed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(status: string, listed?: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(listed === undefined ? {} : { listed }) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "操作失败,请稍后重试。");
        return;
      }
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2 text-xs">
        {status === "published" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => post("draft")}
            className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            下架
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => post("published")}
            className="rounded border border-green-700 px-2 py-1 text-green-400 hover:bg-green-950 disabled:opacity-50"
          >
            上架
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => post(status, !listed)}
          className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
        >
          {listed ? "目录隐藏" : "目录可见"}
        </button>
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
