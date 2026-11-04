"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 后台主题行内操作(置顶/关闭/标签/删除/恢复):POST /api/admin/forum/threads/{id}
 * action 分发;删除需确认;成功 router.refresh。
 */
export function ForumThreadActions({
  threadId,
  pinned,
  closed,
  label,
  deleted,
}: {
  threadId: string;
  pinned: boolean;
  closed: boolean;
  label: string;
  deleted: boolean;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/admin/forum/threads/${threadId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <span className="flex flex-col items-start gap-0.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy || !hydrated}
          className="border-[#34d399]/40 bg-[#34d399]/10 text-[#6ee7b7] hover:border-[#34d399]/60 hover:text-[#6ee7b7]"
          onClick={() => act({ action: "undelete" })}
        >
          恢复
        </Button>
        {error && (
          <span role="alert" className="text-xs text-[#eda9a9]">
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy || !hydrated}
        onClick={() => act({ action: "pin", pinned: !pinned })}
      >
        {pinned ? "取消置顶" : "置顶"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy || !hydrated}
        onClick={() => act({ action: "close", closed: !closed })}
      >
        {closed ? "开放" : "关闭"}
      </Button>
      <Select
        aria-label="状态标签"
        disabled={busy || !hydrated}
        value={label}
        onChange={(e) => act({ action: "label", label: e.target.value })}
        className="w-auto py-0.5 pr-7 text-xs"
      >
        <option value="none">无标签</option>
        <option value="standard">规范</option>
        <option value="resolved">已解决</option>
      </Select>
      <Button
        type="button"
        variant="danger"
        size="sm"
        disabled={busy || !hydrated}
        onClick={() => act({ action: "delete" }, `确认删除主题 #${threadId}?可在回收站恢复。`)}
      >
        删除
      </Button>
      {error && (
        <span role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </span>
      )}
    </span>
  );
}
