"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 商品行内上下架/目录隐藏/删除(FR-127):POST /api/admin/products/[id]/status
 * 与 DELETE /api/admin/products/[id];下架不影响历史订单行快照;
 * 删除仅零订单可成功(有订单 409 呈现后端提示引导下架)。
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
  const hydrated = useHydrated();
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

  async function del() {
    if (!window.confirm("确认删除该商品?仅限无订单记录的商品;用户购物车内的该商品会一并清除。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "删除失败,请稍后重试。");
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
            disabled={busy || !hydrated}
            onClick={() => post("draft")}
            className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            下架
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !hydrated}
            onClick={() => post("published")}
            className="rounded border border-green-700 px-2 py-1 text-green-400 hover:bg-green-950 disabled:opacity-50"
          >
            上架
          </button>
        )}
        <button
          type="button"
          disabled={busy || !hydrated}
          onClick={() => post(status, !listed)}
          className="rounded border border-gray-600 px-2 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
        >
          {listed ? "目录隐藏" : "目录可见"}
        </button>
        <button
          type="button"
          disabled={busy || !hydrated}
          onClick={() => void del()}
          className="rounded border border-red-800 px-2 py-1 text-red-300 hover:bg-red-950 disabled:opacity-50"
        >
          删除
        </button>
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
