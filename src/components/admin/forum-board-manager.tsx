"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Board = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort: number;
  threadCount: number;
};

/** 版块管理区块:新建/行内编辑(slug 可改,审计记 old/new)/删除(有主题拒绝) */
export function ForumBoardManager({ boards }: { boards: Board[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ slug: "", name: "", description: "", sort: "0" });
  const [creating, setCreating] = useState(false);
  const [newBoard, setNewBoard] = useState({ slug: "", name: "", description: "", sort: "0" });

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white";

  async function send(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const resp = await res.json().catch(() => null);
        setError(resp?.error?.message ?? "操作失败,请稍后重试。");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("网络异常,请稍后重试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(b: Board) {
    setEditingId(b.id);
    setDraft({
      slug: b.slug,
      name: b.name,
      description: b.description ?? "",
      sort: String(b.sort),
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">版块管理</h2>
        <button
          type="button"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
          onClick={() => {
            setCreating((v) => !v);
            setNewBoard({ slug: "", name: "", description: "", sort: "0" });
          }}
        >
          {creating ? "收起新建" : "新建版块"}
        </button>
      </div>

      {creating && (
        <form
          className="flex flex-wrap items-end gap-2 rounded border border-gray-700 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send("POST", "/api/admin/forum/boards", {
              slug: newBoard.slug,
              name: newBoard.name,
              description: newBoard.description || undefined,
              sort: Number(newBoard.sort) || 0,
            }).then((ok) => {
              if (ok) setCreating(false);
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            slug
            <input
              required
              value={newBoard.slug}
              onChange={(e) => setNewBoard((d) => ({ ...d, slug: e.target.value }))}
              placeholder="如 guild-hall"
              className={`${inputCls} w-40`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            名称
            <input
              required
              value={newBoard.name}
              onChange={(e) => setNewBoard((d) => ({ ...d, name: e.target.value }))}
              className={`${inputCls} w-36`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            描述
            <input
              value={newBoard.description}
              onChange={(e) => setNewBoard((d) => ({ ...d, description: e.target.value }))}
              className={`${inputCls} w-56`}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-300">
            排序
            <input
              type="number"
              value={newBoard.sort}
              onChange={(e) => setNewBoard((d) => ({ ...d, sort: e.target.value }))}
              className={`${inputCls} w-20`}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            创建
          </button>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400">
            <th className="py-2 pr-3 font-normal">slug</th>
            <th className="py-2 pr-3 font-normal">名称</th>
            <th className="py-2 pr-3 font-normal">描述</th>
            <th className="py-2 pr-3 font-normal">排序</th>
            <th className="py-2 pr-3 font-normal">主题数</th>
            <th className="py-2 pr-3 font-normal">操作</th>
          </tr>
        </thead>
        <tbody>
          {boards.map((b) => (
            <tr key={b.id} className="border-b border-gray-900">
              {editingId === b.id ? (
                <>
                  <td className="py-2 pr-3">
                    <input
                      value={draft.slug}
                      onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                      className={`${inputCls} w-36`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className={`${inputCls} w-32`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      className={`${inputCls} w-52`}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      value={draft.sort}
                      onChange={(e) => setDraft((d) => ({ ...d, sort: e.target.value }))}
                      className={`${inputCls} w-16`}
                    />
                  </td>
                  <td className="py-2 pr-3 text-gray-400">{b.threadCount}</td>
                  <td className="flex flex-wrap gap-1 py-2 pr-3">
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      onClick={() =>
                        send("PUT", `/api/admin/forum/boards/${b.id}`, {
                          slug: draft.slug,
                          name: draft.name,
                          description: draft.description || undefined,
                          sort: Number(draft.sort) || 0,
                        }).then((ok) => {
                          if (ok) setEditingId(null);
                        })
                      }
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 pr-3 font-mono text-gray-300">{b.slug}</td>
                  <td className="py-2 pr-3">{b.name}</td>
                  <td className="py-2 pr-3 text-gray-400">{b.description ?? "—"}</td>
                  <td className="py-2 pr-3 text-gray-400">{b.sort}</td>
                  <td className="py-2 pr-3 text-gray-400">{b.threadCount}</td>
                  <td className="flex flex-wrap gap-1 py-2 pr-3">
                    <button
                      type="button"
                      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400"
                      onClick={() => startEdit(b)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-500 disabled:opacity-50"
                      onClick={() => {
                        if (!window.confirm(`确认删除版块「${b.name}」?`)) return;
                        void send("DELETE", `/api/admin/forum/boards/${b.id}`);
                      }}
                    >
                      删除
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
