"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 媒体选择弹层(FR-217,编辑器插入 + /admin/media 管理共用列表逻辑):
 * 列表 20/页+文件名搜索;上传走 multipart /api/admin/media;删除二次确认
 * (正文死链风险提示来自接口 warning);onPick 由编辑器注入插入行为。
 */
export type MediaAssetItem = {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function uploadMediaFiles(files: File[]): Promise<MediaAssetItem[]> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch("/api/admin/media", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? "上传失败,请稍后重试。");
  return body.items as MediaAssetItem[];
}

export function MediaAssetList({
  onPick,
  onDelete,
  refreshKey = 0,
}: {
  onPick?: (asset: MediaAssetItem) => void;
  onDelete?: () => void;
  refreshKey?: number;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: MediaAssetItem[];
    total: number;
    totalPages: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    fetch(`/api/admin/media?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => setError("媒体列表加载失败"));
    return () => {
      cancelled = true;
    };
  }, [q, page, refreshKey]);

  async function remove(asset: MediaAssetItem) {
    if (
      !window.confirm(
        `确认删除「${asset.originalName}」?若正文曾引用该文件,相应位置的图片将变成死链。`,
      )
    ) {
      return;
    }
    setError(null);
    const res = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "删除失败");
      return;
    }
    setData((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== asset.id) } : prev,
    );
    onDelete?.();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="搜索文件名…"
          className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-white"
        />
        <span className="text-gray-500">共 {data?.total ?? "…"} 个</span>
      </div>
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      <ul className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto md:grid-cols-3">
        {(data?.items ?? []).map((asset) => (
          <li key={asset.id} className="rounded border border-gray-700 p-2">
            <button
              type="button"
              onClick={() => onPick?.(asset)}
              className="block w-full text-left"
              title={onPick ? "点击插入" : asset.originalName}
            >
              {asset.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.url} alt={asset.originalName} className="h-20 w-full object-contain" />
              ) : (
                <span className="flex h-20 items-center justify-center text-gray-400">PDF</span>
              )}
              <span className="mt-1 block truncate text-xs text-gray-300">{asset.originalName}</span>
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={() => remove(asset)}
                className="mt-1 text-xs text-red-400 hover:text-red-300"
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="disabled:opacity-40"
          >
            ← 上一页
          </button>
          <span>
            第 {page} / {data?.totalPages} 页
          </span>
          <button
            type="button"
            disabled={page >= (data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-40"
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}

export function MediaPickerModal({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMediaFiles(Array.from(files));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-700 bg-[#0d1728] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-[#e6d8a8]">媒体库</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
            关闭
          </button>
        </div>
        <div className="mb-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={busy}
            onChange={(e) => handleUpload(e.target.files)}
            className="text-xs text-gray-300"
          />
          {busy && <span className="ml-2 text-xs text-gray-400">上传中…</span>}
        </div>
        <MediaAssetList
          refreshKey={refreshKey}
          onPick={(asset) => {
            onInsert(`![](${asset.url})\n`);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
