"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { useSortableList } from "@/components/admin/use-sortable-list";
import { BannerEditorFields, BannerImagePreview } from "./edit-fields";

import { EMPTY, type Banner, type Draft } from "./draft-types";

/**
 * 轮播物料管理(2026-11-03 重做,Elementor 式所见即所得):
 * 卡片即预览(16:5 图+标题覆盖+启停开关),原生拖拽排序(触屏有 ↑↓ 兜底,
 * 落下即按新序持久化 sort),编辑/新建在卡片原位展开(图片即时预览)。
 */
export function BannerManager({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [creating, setCreating] = useState(false);
  const [newBanner, setNewBanner] = useState<Draft>(EMPTY);

  // 排序流程(#79 抽共享 Hook):顺序/拖拽/防重入/持久化统一由 useSortableList 承担
  const { ordered, dragId, setDragId, reordering, moveBy, moveTo } = useSortableList<Banner>({
    items: banners,
    enabled: hydrated && !busy,
    save: async (b, index) => {
      await requestJson(`/api/admin/banners/${b.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: b.title,
          imageUrl: b.imageUrl,
          linkUrl: b.linkUrl,
          sort: index,
          enabled: b.enabled,
        }),
      });
    },
    onError: setError,
    onPersisted: () => router.refresh(),
  });

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

  function toPayload(d: Draft) {
    return {
      title: d.title,
      imageUrl: d.imageUrl,
      linkUrl: d.linkUrl.trim(),
      sort: Number(d.sort) || 0,
      enabled: d.enabled,
    };
  }

  const editorPreviewUrl = editingId !== null ? draft.imageUrl : newBanner.imageUrl;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#dcebf7]">轮播物料</h2>
        <Button
          type="button"
          variant="primary"
          disabled={!hydrated}
          onClick={() => {
            setCreating((v) => !v);
            setNewBanner(EMPTY);
          }}
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {creating ? "收起新建" : "新建物料"}
        </Button>
      </div>

      {creating && (
        <form
          className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send("POST", "/api/admin/banners", toPayload(newBanner)).then((ok) => {
              if (ok) {
                setCreating(false);
                setNewBanner(EMPTY);
              }
            });
          }}
        >
          {editorPreviewUrl ? <BannerImagePreview url={editorPreviewUrl} /> : null}
          <BannerEditorFields draft={newBanner} setDraft={setNewBanner} disabled={busy || !hydrated} />
          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy || !hydrated}>
              创建
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              取消
            </Button>
          </div>
        </form>
      )}

      {banners.length === 0 && !creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={`flex aspect-[16/5] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#22385a] text-[#6482a3] transition hover:border-[#6fb7e0]/50 hover:text-[#93b2ce] ${FOCUS_RING}`}
        >
          <Plus aria-hidden="true" className="h-5 w-5" />
          暂无轮播物料,点击新建;首页轮播位在存在启用物料时展示。
        </button>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {ordered.map((b, index) =>
            editingId === b.id ? (
              <div key={b.id} className="rounded-xl border border-[#6fb7e0]/50 bg-[#13233a] p-4">
                {editorPreviewUrl ? <BannerImagePreview url={editorPreviewUrl} /> : null}
                <BannerEditorFields draft={draft} setDraft={setDraft} disabled={busy || !hydrated} />
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={busy || !hydrated}
                    onClick={() =>
                      void send("PUT", `/api/admin/banners/${b.id}`, toPayload(draft)).then((ok) => {
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
                data-testid="banner-card"
                data-title={b.title}
                draggable={hydrated && !busy}
                onDragStart={() => setDragId(b.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dragId && moveTo(dragId, b.id)}
                onDragEnd={() => setDragId(null)}
                className={`group relative overflow-hidden rounded-xl border bg-[#13233a] transition ${
                  dragId === b.id ? "border-[#6fb7e0] opacity-60" : "border-[#22385a] hover:border-[#35577f]"
                }`}
              >
                <div className="relative aspect-[16/5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt={b.title} className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#081120]/85 via-transparent to-transparent" />
                  <span className="absolute left-3 top-2.5 max-w-[70%] truncate text-[15px] font-semibold text-white drop-shadow">
                    {b.title || "未命名"}
                  </span>
                  {!b.enabled && (
                    <span className="absolute right-3 top-2.5 rounded-full border border-white/30 bg-black/50 px-2 py-0.5 text-[11px] text-white/80">
                      已停用
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    title="拖拽排序"
                    className="absolute bottom-2 left-2 cursor-grab rounded-md bg-black/45 p-1 text-white/70 opacity-0 transition group-hover:opacity-100"
                  >
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 backdrop-blur">
                    <Switch
                      checked={b.enabled}
                      disabled={busy || !hydrated}
                      onChange={(v) =>
                        void send("PUT", `/api/admin/banners/${b.id}`, {
                          title: b.title,
                          imageUrl: b.imageUrl,
                          linkUrl: b.linkUrl,
                          sort: b.sort,
                          enabled: v,
                        })
                      }
                      ariaLabel={`启用「${b.title || "未命名"}」`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || !hydrated}
                      onClick={() => {
                        setEditingId(b.id);
                        setDraft({
                          title: b.title,
                          imageUrl: b.imageUrl,
                          linkUrl: b.linkUrl,
                          sort: String(b.sort),
                          enabled: b.enabled,
                        });
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`上移「${b.title || "未命名"}」`}
                      disabled={busy || !hydrated || index === 0 || reordering}
                      onClick={() => moveBy(b.id, -1)}
                    >
                      <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`下移「${b.title || "未命名"}」`}
                      disabled={busy || !hydrated || index === ordered.length - 1 || reordering}
                      onClick={() => moveBy(b.id, 1)}
                    >
                      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={busy || !hydrated}
                      onClick={() => {
                        if (!window.confirm(`确认删除轮播物料「${b.title || "未命名"}」?`)) return;
                        void send("DELETE", `/api/admin/banners/${b.id}`);
                      }}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              </div>
            ),
          )}
          {banners.length > 0 && creating === false && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={`flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#22385a] text-[#6482a3] transition hover:border-[#6fb7e0]/50 hover:text-[#93b2ce] ${FOCUS_RING}`}
            >
              <Plus aria-hidden="true" className="h-5 w-5" />
              新建一张轮播
            </button>
          )}
        </div>
      )}

      {(reordering || busy) && <p className="text-xs text-[#93b2ce]">处理中…</p>}
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
    </section>
  );
}
