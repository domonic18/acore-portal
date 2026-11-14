"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import {
  THREAD_LABEL_OPTIONS,
  THREAD_STATUS_TEXT,
  type ThreadStatusLabelValue,
} from "@/constants/forum";

/**
 * 后台主题列表批量设状态(2026-11-14):Provider 持选中态,
 * 行 checkbox/全选/工具栏共享同一 Context;应用后刷新并清空选择。
 *
 * 批量与单条走同一个状态写入口(moderate.ts 的 writeStatusInTx);
 * 工具栏下拉同样是状态的唯一出口(与行内状态下拉同口径:选「已关闭」即关帖)。
 * 水合前禁用:受控 checkbox/select 在水合前丢变更(规则 30)。
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

export function ForumThreadSelectionProvider({
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
  if (!ctx) throw new Error("ForumThreadSelection context missing");
  return ctx;
}

export function ForumThreadSelectAllCheckbox() {
  const { allSelected, toggleAll } = useSelection();
  const hydrated = useHydrated();
  return (
    <input
      type="checkbox"
      aria-label="全选主题"
      checked={allSelected}
      disabled={!hydrated}
      onChange={toggleAll}
      className="align-middle accent-[#6fb7e0]"
    />
  );
}

export function ForumThreadRowCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  const hydrated = useHydrated();
  return (
    <input
      type="checkbox"
      aria-label={`选择主题 ${id}`}
      checked={selected.has(id)}
      disabled={!hydrated}
      onChange={() => toggle(id)}
      className="align-middle accent-[#6fb7e0]"
    />
  );
}

/** 批量工具条:状态下拉 + 应用;应用后刷新列表并清空选择 */
export function ForumThreadBulkToolbar() {
  const { selected, clear } = useSelection();
  const router = useRouter();
  const hydrated = useHydrated();
  const [status, setStatus] = useState<ThreadStatusLabelValue>("resolved");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function apply() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = await requestJson<{ updated?: number }>(
        "/api/admin/forum/threads/bulk",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [...selected], status }),
        },
      );
      setMessage(
        `已将 ${body.updated ?? selected.size} 个主题设为「${THREAD_STATUS_TEXT[status]}」`,
      );
      clear();
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="forum-bulk-toolbar"
      className="flex flex-col gap-2 text-sm sm:flex sm:flex-wrap sm:items-center sm:gap-2"
    >
      <span className="text-[#93b2ce]">已选 {selected.size} 个主题</span>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          aria-label="批量状态"
          disabled={busy || !hydrated}
          value={status}
          onChange={(e) => setStatus(e.target.value as ThreadStatusLabelValue)}
          className="w-auto py-0.5 pr-7 text-xs"
        >
          {THREAD_LABEL_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {THREAD_STATUS_TEXT[v]}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || !hydrated || selected.size === 0}
          onClick={() => void apply()}
        >
          应用状态
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy || selected.size === 0}
          onClick={clear}
        >
          清空选择
        </Button>
      </div>
      {message && <span className="text-xs text-[#6ee7b7]">{message}</span>}
      {error && (
        <span role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </span>
      )}
    </div>
  );
}
