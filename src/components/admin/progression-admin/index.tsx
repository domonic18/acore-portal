"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatPhaseDate,
  ProgressionTimeline,
  type ProgressionNodeState,
} from "@/components/site/progression-timeline";
import {
  ProgressionCardEditor,
  type ProgressionDraftItem,
} from "../progression-card-editor";
import { uploadMediaFiles } from "../media-library";
import { errorMessage, requestJson } from "@/lib/api-client";
import { toDraft, toPayload, type AdminProgressionNode } from "./draft";

export type { AdminProgressionNode };

/**
 * 渐进计划后台(M4 深化):在渐进页同款时间轴上就地编辑(WP 区块编辑器语义)。
 * 本地整树编辑(数组顺序=时间轴顺序,↑↓ 排序)→ 一次 PUT /api/admin/progression。
 * 卡片查看态与前台渲染一致,「编辑」原位展开表单;顶部同步当前阶段指针与未保存状态。
 */
export function ProgressionAdmin({ nodes }: { nodes: AdminProgressionNode[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ProgressionDraftItem[]>(() => nodes.map(toDraft));
  const [currentId, setCurrentId] = useState<string | null>(
    () => nodes.find((node) => node.isCurrent)?.id ?? null,
  );
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [savedJson, setSavedJson] = useState(() =>
    JSON.stringify(
      toPayload(nodes.map(toDraft), [], nodes.find((node) => node.isCurrent)?.id ?? null),
    ),
  );
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingUid, setUploadingUid] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<{ uid: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(
    () => toPayload(items, removedIds, currentId),
    [items, removedIds, currentId],
  );
  const dirty = JSON.stringify(payload) !== savedJson;

  // 当前阶段口径与前台一致:指针优先,缺省回退末位开放
  const effectiveCurrentIndex = currentId
    ? items.findIndex((item) => item.id === currentId)
    : items.reduce((acc, item, index) => (item.status === "open" ? index : acc), -1);
  const effectiveCurrent = effectiveCurrentIndex >= 0 ? items[effectiveCurrentIndex] : undefined;
  const nextItem = effectiveCurrentIndex >= 0 ? items[effectiveCurrentIndex + 1] : undefined;

  function patchItem(uid: string, patch: Partial<ProgressionDraftItem>) {
    setSaved(false);
    setItems((prev) => prev.map((item) => (item.uid === uid ? { ...item, ...patch } : item)));
  }

  function moveItem(uid: string, dir: -1 | 1) {
    setSaved(false);
    setItems((prev) => {
      const index = prev.findIndex((item) => item.uid === uid);
      const target = index + dir;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function removeItem(uid: string) {
    const item = items.find((entry) => entry.uid === uid);
    if (!item) return;
    const tip =
      item.id && currentId === item.id
        ? `「${item.title || "未命名阶段"}」是当前阶段,删除后向前台回退末位开放阶段。确认删除?`
        : `确认删除阶段「${item.title || "未命名阶段"}」?保存后生效。`;
    if (!window.confirm(tip)) return;
    setSaved(false);
    setItems((prev) => prev.filter((entry) => entry.uid !== uid));
    if (item.id) setRemovedIds((prev) => [...prev, item.id!]);
    if (currentId && currentId === item.id) setCurrentId(null);
    if (editingUid === uid) setEditingUid(null);
  }

  function addItem() {
    if (items.length >= 200) return;
    setSaved(false);
    setError(null);
    const uid = crypto.randomUUID();
    setItems((prev) => [
      ...prev,
      {
        uid,
        id: null,
        title: "",
        phaseDate: "",
        imageUrl: "",
        bodyMd: "",
        status: "locked",
        icon: "",
      },
    ]);
    setEditingUid(uid);
  }

  function reset() {
    const next = nodes.map(toDraft);
    const nextCurrent = nodes.find((node) => node.isCurrent)?.id ?? null;
    setItems(next);
    setCurrentId(nextCurrent);
    setRemovedIds([]);
    setSavedJson(JSON.stringify(toPayload(next, [], nextCurrent)));
    setEditingUid(null);
    setError(null);
    setSaved(false);
  }

  async function uploadImage(uid: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setUploadingUid(uid);
    setUploadError(null);
    setError(null);
    try {
      const [asset] = await uploadMediaFiles([...files]);
      if (asset) patchItem(uid, { imageUrl: asset.url });
    } catch (e) {
      const message = e instanceof Error ? e.message : "上传失败,请稍后重试。";
      setUploadError({ uid, message });
      setError(message);
    } finally {
      setBusy(false);
      setUploadingUid(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    const blank = items.find((item) => !item.title.trim());
    if (blank) {
      setEditingUid(blank.uid);
      setError("每个阶段都需要填写标题。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = await requestJson<{ items?: { id: string }[] }>("/api/admin/progression", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const savedIds = body.items ?? [];
      const next = items.map((item, index) => ({
        ...item,
        id: savedIds[index]?.id ?? item.id,
      }));
      setItems(next);
      setRemovedIds([]);
      setSavedJson(JSON.stringify(toPayload(next, [], currentId)));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="progression-editor">
      <section className="rounded-xl border border-[#22385a] bg-[#0d1a2e] px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#93b2ce]">
            <label className="flex items-center gap-2">
              当前阶段
              <select
                data-testid="progression-current"
                value={currentId ?? ""}
                onChange={(e) => {
                  setSaved(false);
                  setCurrentId(e.target.value || null);
                }}
                className="rounded border border-[#35577f] bg-[#13233a] px-2 py-1 text-[13px] text-[#dcebf7] focus:border-[#6fb7e0] focus:outline-none"
              >
                <option value="">自动(回退末位开放)</option>
                {items
                  .filter((item) => item.id)
                  .map((item) => (
                    <option key={item.uid} value={item.id!}>
                      {item.title || "未命名阶段"}
                    </option>
                  ))}
              </select>
            </label>
            <span>
              下一阶段:
              <strong className="ml-1 font-semibold text-[#e8c877]">
                {nextItem?.title || "暂无"}
              </strong>
            </span>
            {effectiveCurrent && !currentId && (
              <span className="text-[12px] text-[#6482a3]">
                当前按末位开放阶段推算
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {dirty && (
              <span data-testid="progression-dirty" className="text-[12px] text-[#e8c877]">
                ● 有未保存的修改
              </span>
            )}
            {!dirty && saved && (
              <span data-testid="progression-saved" className="text-[12px] text-[#7bd88f]">
                已更新,前台即时生效
              </span>
            )}
            <button
              type="button"
              data-testid="progression-reset"
              onClick={reset}
              disabled={busy || !dirty}
              className="rounded border border-[#35577f] px-3 py-1.5 text-[12.5px] text-[#93b2ce] hover:border-[#6fb7e0] hover:text-[#dcebf7] disabled:opacity-40"
            >
              撤销修改
            </button>
            <button
              type="button"
              data-testid="progression-save"
              onClick={submit}
              disabled={busy}
              className="rounded bg-[#e8c877] px-5 py-1.5 text-[12.5px] font-semibold text-[#0a1220] hover:bg-[#f3d78f] disabled:opacity-50"
            >
              {busy ? "保存中…" : "更新"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[#6482a3]">
          直接在下方时间轴上编辑:点击卡片右上「编辑」修改内容,↑ ↓ 调整顺序,「设为当前」钉住当前阶段;改动一次性「更新」。
        </p>
        {error && (
          <p data-testid="progression-error" className="mt-2 text-[12.5px] text-[#f08787]">
            {error}
          </p>
        )}
      </section>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#35577f] py-16 text-center text-sm text-[#6482a3]">
          暂无渐进阶段,点击下方「添加阶段」开始。
        </p>
      ) : (
        <ProgressionTimeline
          items={items.map((item, index) => {
            const isCurrent = effectiveCurrent?.uid === item.uid;
            const state: ProgressionNodeState = isCurrent
              ? "current"
              : item.status === "locked"
                ? "locked"
                : "open";
            return {
              key: item.uid,
              state,
              dateLabel: formatPhaseDate(item.phaseDate || null),
              card: (
                <ProgressionCardEditor
                  item={item}
                  index={index}
                  total={items.length}
                  editing={editingUid === item.uid}
                  busy={busy}
                  uploading={uploadingUid === item.uid}
                  uploadError={uploadError?.uid === item.uid ? uploadError.message : null}
                  isCurrent={isCurrent}
                  canSetCurrent={Boolean(item.id) && currentId !== item.id}
                  fileInputRef={fileRef}
                  onEdit={() => {
                    setEditingUid(item.uid);
                    setError(null);
                  }}
                  onDone={() => setEditingUid(null)}
                  onChange={(patch) => patchItem(item.uid, patch)}
                  onMove={(dir) => moveItem(item.uid, dir)}
                  onRemove={() => removeItem(item.uid)}
                  onSetCurrent={() => {
                    setSaved(false);
                    setCurrentId(item.id);
                  }}
                  onUpload={(files) => uploadImage(item.uid, files)}
                />
              ),
            };
          })}
        />
      )}

      <div className="flex justify-center">
        <button
          type="button"
          data-testid="progression-add"
          onClick={addItem}
          disabled={busy || items.length >= 200}
          className="rounded-md border border-[#35577f] bg-[#13233a] px-5 py-2 text-[13px] text-[#a8d9f5] hover:border-[#6fb7e0] hover:text-white disabled:opacity-40"
        >
          + 添加阶段
        </button>
      </div>
    </div>
  );
}
