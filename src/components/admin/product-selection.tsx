"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * 商品列表批量选择(二期商城增强):Provider 持选中态,
 * 行 checkbox/全选/工具栏共享同一 Context;操作后刷新并清空选择。
 */
type SelectionContextValue = {
  ids: string[];
  selected: Set<string>;
  allSelected: boolean;
  toggle: (id: string) => void;
  toggleAll: () => void;
  clear: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function ProductSelectionProvider({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const value = useMemo<SelectionContextValue>(
    () => ({
      ids,
      selected,
      allSelected: ids.length > 0 && selected.size === ids.length,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      toggleAll: () =>
        setSelected((prev) =>
          prev.size === ids.length ? new Set() : new Set(ids),
        ),
      clear: () => setSelected(new Set()),
    }),
    [ids, selected],
  );
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("ProductSelection context missing");
  return ctx;
}

export function ProductSelectAllCheckbox() {
  const { allSelected, toggleAll } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label="全选商品"
      checked={allSelected}
      onChange={toggleAll}
      className="align-middle"
    />
  );
}

export function ProductRowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      aria-label={`选择商品 ${id}`}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="align-middle"
    />
  );
}

const ACTIONS = [
  { action: "publish", label: "批量上架" },
  { action: "draft", label: "批量下架" },
  { action: "list", label: "目录显示" },
  { action: "unlist", label: "目录隐藏" },
] as const;

export function ProductBatchToolbar() {
  const { selected, clear } = useSelection();
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: (typeof ACTIONS)[number]["action"]) {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/products/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "批量操作失败,请稍后重试。");
        return;
      }
      const body = await res.json().catch(() => null);
      setMessage(`已处理 ${body?.updated ?? selected.size} 件`);
      clear();
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="product-batch-toolbar"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-gray-400">已选 {selected.size} 件</span>
      {ACTIONS.map((a) => (
        <button
          key={a.action}
          type="button"
          disabled={busy || !hydrated || selected.size === 0}
          onClick={() => void run(a.action)}
          className="rounded border border-gray-600 px-3 py-1 text-gray-300 hover:bg-gray-800 disabled:opacity-40"
        >
          {a.label}
        </button>
      ))}
      {message && <span className="text-xs text-green-400">{message}</span>}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
