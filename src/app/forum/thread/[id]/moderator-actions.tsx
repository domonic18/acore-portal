"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  THREAD_LABEL_OPTIONS,
  THREAD_STATUS_TEXT,
  type ThreadStatusLabelValue,
} from "@/constants/forum";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 版主操作条(T040,FR-220):仅 moderator/admin 服务端渲染可见;
 * 全部走 /api/forum/moderate/thread/[id]/*,成功后 refresh(审计在服务端落)。
 *
 * 状态下拉 = 帖子的完整状态(无标签/已解决/请补充/已关闭);
 * 下拉是状态的唯一出口:选「已关闭」即关帖(关帖后禁回帖),切到其他标签即重开;
 * 旁边的「关闭主题/重开主题」按钮只是同一动作的一键快捷方式。
 */
export function ModeratorActions({
  threadId,
  pinned,
  featured,
  closed,
  statusLabel,
  boardSlug,
}: {
  threadId: string;
  pinned: boolean;
  featured: boolean;
  closed: boolean;
  statusLabel: ThreadStatusLabelValue;
  boardSlug: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(path: string, method: string, body?: object) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(`/api/forum/moderate/thread/${threadId}${path}`, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, method: string, body?: object) {
    if (await request(path, method, body)) router.refresh();
  }

  async function remove() {
    if (!window.confirm("确认删除该主题?楼层将一并隐藏(数据保留)。")) return;
    if (await request("", "DELETE")) router.push(`/forum/${boardSlug}`);
  }

  const btn =
    "rounded-lg border px-2.5 py-1.5 text-[12px] disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-alt px-3.5 py-2.5 text-xs">
      <span className="font-medium text-muted">版主操作：</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/pin", "POST", { pinned: !pinned })}
        className={`${btn} border-warn-bg text-highlight-soft hover:bg-warn-bg/30`}
      >
        {pinned ? "取消置顶" : "置顶"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/featured", "POST", { featured: !featured })}
        className={`${btn} border-warn-bg text-highlight-soft hover:bg-warn-bg/30`}
      >
        {featured ? "取消加精" : "加精"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => act("/close", "POST", { closed: !closed })}
        className={`${btn} border-warn-line text-highlight-soft hover:bg-warn-line/30`}
      >
        {closed ? "重开主题" : "关闭主题"}
      </button>
      <label className="flex items-center gap-1 text-muted">
        状态标签
        <select
          disabled={busy}
          value={statusLabel}
          onChange={(e) => act("/label", "POST", { label: e.target.value })}
          className="rounded border border-line-strong bg-panel-inset px-1 py-1 text-foreground"
        >
          {THREAD_LABEL_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {THREAD_STATUS_TEXT[v]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className={`${btn} ml-auto border-danger/30 text-danger-soft hover:bg-danger/10`}
      >
        删除
      </button>
      {error && <span className="w-full text-danger-soft">{error}</span>}
    </div>
  );
}
