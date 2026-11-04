"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

/**
 * 商品行内上下架/目录隐藏/删除(FR-127):POST /api/admin/products/[id]/status
 * 与 DELETE /api/admin/products/[id];下架不影响历史订单行快照;
 * 删除仅零订单可成功(有订单 409 呈现后端提示引导下架)。
 */
export function ProductStatusActions({
  productId,
  status,
  listed,
  type,
}: {
  productId: string;
  status: string;
  listed: boolean;
  type: string;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(status: string, listed?: boolean) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/products/${productId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(listed === undefined ? {} : { listed }) }),
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/products/${productId}/duplicate`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!window.confirm("确认删除该商品?仅限无订单记录的商品;用户购物车内的该商品会一并清除。")) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/products/${productId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5 text-xs">
        {status === "published" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !hydrated}
            onClick={() => post("draft")}
          >
            下架
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || !hydrated}
            onClick={() => post("published")}
            className="text-[#6ee7b7] hover:text-[#a7f3d0]"
          >
            上架
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || !hydrated}
          onClick={() => post(status, !listed)}
        >
          {listed ? "目录隐藏" : "目录可见"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || !hydrated || type === "game_item"}
          onClick={() => void duplicate()}
          title={
            type === "game_item"
              ? "物品类商品不可复制:同一物品只能映射一个 itemsend_{id} SKU"
              : "复制为草稿副本"
          }
          className="disabled:cursor-not-allowed disabled:opacity-40"
        >
          复制
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={busy || !hydrated}
          onClick={() => void del()}
        >
          删除
        </Button>
      </div>
      {error && <span className="text-xs text-[#eda9a9]">{error}</span>}
    </div>
  );
}
