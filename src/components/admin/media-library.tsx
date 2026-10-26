"use client";

import { useEffect, useRef, useState } from "react";
import { MEDIA_CATEGORIES, MEDIA_DEFAULT_CATEGORY } from "@/constants/media";

/**
 * 媒体选择弹层(FR-217,编辑器插入 + /admin/media 管理共用列表逻辑):
 * 列表 20/页+文件名搜索;上传走 multipart /api/admin/media;删除二次确认
 * (正文死链风险提示来自接口 warning);onPick 由编辑器注入插入行为。
 */
export type MediaAssetItem = {
  id: string;
  url: string;
  originalName: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
};

export async function uploadMediaFiles(
  files: File[],
  category?: string,
): Promise<MediaAssetItem[]> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  if (category) fd.append("category", category);
  const res = await fetch("/api/admin/media", { method: "POST", body: fd });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message ?? "上传失败,请稍后重试。");
  return body.items as MediaAssetItem[];
}

export function MediaAssetList({
  onPick,
  onDelete,
  refreshKey = 0,
  defaultCategory = "",
}: {
  onPick?: (asset: MediaAssetItem) => void;
  onDelete?: () => void;
  refreshKey?: number;
  /** 初始分类(如商品配图入口默认「商店配图」);空=全部 */
  defaultCategory?: string;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState(defaultCategory);
  const [data, setData] = useState<{
    items: MediaAssetItem[];
    total: number;
    totalPages: number;
    counts: Record<string, number>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    fetch(`/api/admin/media?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => setError("媒体列表加载失败"));
    return () => {
      cancelled = true;
    };
  }, [q, page, category, refreshKey]);

  // 分类 tab:按数量降序,稳定呈现(同数按名称)
  const tabs = data
    ? Object.entries(data.counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    : [];

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
      {tabs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="媒体分类">
          <button
            type="button"
            role="tab"
            aria-selected={category === ""}
            onClick={() => {
              setCategory("");
              setPage(1);
            }}
            className={`rounded-full border px-3 py-0.5 text-xs ${
              category === ""
                ? "border-amber-400 text-amber-300"
                : "border-gray-700 text-gray-400 hover:border-gray-500"
            }`}
          >
            全部
          </button>
          {tabs.map(([name, count]) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              onClick={() => {
                setCategory(name);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-0.5 text-xs ${
                category === name
                  ? "border-amber-400 text-amber-300"
                  : "border-gray-700 text-gray-400 hover:border-gray-500"
              }`}
            >
              {name}({count})
            </button>
          ))}
        </div>
      )}
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

/** 上传分类选择(FileBird 一级文件夹;新上传落此分类,商品图编辑器固定商店配图不走此控件) */
export function MediaCategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-xs text-gray-300">
      上传分类
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-white"
      >
        {MEDIA_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
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
  const [category, setCategory] = useState<string>(MEDIA_DEFAULT_CATEGORY);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMediaFiles(Array.from(files), category);
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
        <div className="mb-3 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={busy}
            onChange={(e) => handleUpload(e.target.files)}
            className="text-xs text-gray-300"
          />
          <MediaCategorySelect value={category} onChange={setCategory} />
          {busy && <span className="text-xs text-gray-400">上传中…</span>}
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
