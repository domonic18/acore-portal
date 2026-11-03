"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { ForumBoardEditorFields } from "@/components/admin/forum-board-edit";
import { NavIcon } from "@/components/admin/nav-icons";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { errorMessage, requestJson } from "@/lib/api-client";

type Board = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort: number;
  threadCount: number;
};

type Draft = { slug: string; name: string; description: string; icon: string };

const EMPTY: Draft = { slug: "", name: "", description: "", icon: "" };

/**
 * 版块管理(2026-11-03 重做):卡片即版块(图标+名称+说明摘要+主题数),
 * 原生拖拽/↑↓ 排序(落下按新序持久化 sort),编辑/新建原位展开——
 * 说明走 MarkdownEditor(紧凑 280px),图标从预设网格点选(空=默认首字占位)。
 */
export function ForumBoardManager({ boards }: { boards: Board[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [newBoard, setNewBoard] = useState<Draft>(EMPTY);
  const [order, setOrder] = useState<string[]>(() => boards.map((b) => b.id));
  const [dragId, setDragId] = useState<string | null>(null);

  useEffect(() => {
    setOrder((prev) => {
      const ids = boards.map((b) => b.id);
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [boards]);

  const byId = new Map(boards.map((b) => [b.id, b]));
  const ordered = order.map((id) => byId.get(id)).filter((b): b is Board => Boolean(b));

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await requestJson(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function persistOrder(next: string[]) {
    if (busy) return;
    setError(null);
    try {
      await Promise.all(
        next.map((id, index) => {
          const b = byId.get(id);
          if (!b || b.sort === index) return Promise.resolve();
          return requestJson(`/api/admin/forum/boards/${id}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: b.name, sort: index }),
          });
        }),
      );
      setOrder(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function moveLocal(id: string, delta: number) {
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    next.splice(index, 1);
    next.splice(target, 0, id);
    void persistOrder(next);
  }

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(order.indexOf(targetId), 0, dragId);
    setDragId(null);
    void persistOrder(next);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#dcebf7]">版块管理</h2>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            setCreating((v) => !v);
            setNewBoard(EMPTY);
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {creating ? "收起新建" : "新建版块"}
        </Button>
      </div>

      {creating && (
        <form
          className="flex flex-col gap-3 rounded-xl border border-[#6fb7e0]/50 bg-[#13233a] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send("POST", "/api/admin/forum/boards", {
              slug: newBoard.slug,
              name: newBoard.name,
              description: newBoard.description || undefined,
              icon: newBoard.icon || undefined,
              sort: boards.length,
            }).then((ok) => {
              if (ok) {
                setCreating(false);
                setNewBoard(EMPTY);
              }
            });
          }}
        >
          <ForumBoardEditorFields draft={newBoard} setDraft={setNewBoard} />
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              创建
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {ordered.map((b, index) =>
          editingId === b.id ? (
            <div key={b.id} className="rounded-xl border border-[#6fb7e0]/50 bg-[#13233a] p-4">
              <ForumBoardEditorFields draft={draft} setDraft={setDraft} />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    send("PUT", `/api/admin/forum/boards/${b.id}`, {
                      slug: draft.slug,
                      name: draft.name,
                      description: draft.description || null,
                      icon: draft.icon || null,
                    }).then((ok) => {
                      if (ok) setEditingId(null);
                    })
                  }
                >
                  保存
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(b.id)}
              onDragEnd={() => setDragId(null)}
              className={`flex items-center gap-3.5 rounded-xl border bg-[#13233a] px-4 py-3 transition ${
                dragId === b.id ? "border-[#6fb7e0] opacity-60" : "border-[#22385a] hover:border-[#35577f]"
              }`}
            >
              <span
                aria-hidden="true"
                title="拖拽排序"
                className="cursor-grab text-[#6482a3] hover:text-[#93b2ce]"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0d1828] text-[#a8d9f5]">
                {b.icon ? (
                  <NavIcon icon={b.icon} className="h-5 w-5" />
                ) : (
                  <span className="text-lg">{b.name.slice(0, 1)}</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15.5px] font-semibold text-[#dcebf7]">{b.name}</span>
                  <span className="rounded bg-[#0d1828] px-1.5 py-0.5 font-mono text-[11px] text-[#6482a3]">
                    {b.slug}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[12.5px] text-[#6482a3]">
                  {b.description ? b.description.split("\n")[0] : "暂无说明"}
                </p>
              </div>
              <span className="hidden shrink-0 text-[13px] text-[#93b2ce] sm:block">
                {b.threadCount} 主题
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`上移「${b.name}」`}
                  disabled={busy || index === 0}
                  onClick={() => moveLocal(b.id, -1)}
                >
                  <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`下移「${b.name}」`}
                  disabled={busy || index === ordered.length - 1}
                  onClick={() => moveLocal(b.id, 1)}
                >
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditingId(b.id);
                    setDraft({
                      slug: b.slug,
                      name: b.name,
                      description: b.description ?? "",
                      icon: b.icon ?? "",
                    });
                  }}
                >
                  编辑
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm(`确认删除版块「${b.name}」?`)) return;
                    void send("DELETE", `/api/admin/forum/boards/${b.id}`);
                  }}
                >
                  删除
                </Button>
              </div>
            </div>
          ),
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </section>
  );
}
