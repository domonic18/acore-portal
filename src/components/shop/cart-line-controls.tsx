"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 购物车行数量/移除控件:PATCH·DELETE /api/cart/[id];
 * 售罄行禁增(409 拦截的后端契约在前端同样置灰);成功后 router.refresh() 复核。
 */
export function CartLineControls({
  itemId,
  qty,
  soldOut,
}: {
  itemId: string;
  qty: number;
  soldOut: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patchQty(next: number) {
    if (busy || next === qty || next < 1) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cart/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qty: next }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = await res.json();
      setError(
        body?.error?.code === "OUT_OF_STOCK"
          ? "商品已售罄,无法增加数量。"
          : (body?.error?.message as string) ?? "操作失败。",
      );
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/cart/${itemId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else setError("移除失败,请稍后重试。");
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="减少数量"
          onClick={() => patchQty(qty - 1)}
          disabled={busy || qty <= 1}
          className="h-8 w-8 rounded border border-gray-700 text-lg disabled:opacity-40"
        >
          −
        </button>
        <span aria-label="数量" className="w-8 text-center">
          {qty}
        </span>
        <button
          type="button"
          aria-label="增加数量"
          onClick={() => patchQty(qty + 1)}
          disabled={busy || soldOut}
          className="h-8 w-8 rounded border border-gray-700 text-lg disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="ml-3 text-sm text-red-400 hover:text-red-300 disabled:opacity-40"
        >
          移除
        </button>
      </div>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}
