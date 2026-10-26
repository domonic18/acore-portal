"use client";

import { useRef, useState } from "react";
import {
  MediaAssetList,
  uploadMediaFiles,
} from "@/components/admin/media-library";

/**
 * 商品图片编辑器(WP featured image 对齐,FR-126 扩展):
 * 上传/媒体库选图追加到有序列表(首图=主图,商城卡与详情主图);
 * 上移/下移/移除;图片加载失败缩略显占位。
 */
export function ProductImagesEditor({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  }

  function append(urls: string[]) {
    onChange([...images, ...urls.filter((u) => !images.includes(u))]);
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const assets = await uploadMediaFiles(Array.from(files));
      append(assets.map((a) => a.url));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-gray-300">商品图片(首图=主图,最多 20 张)</span>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <li
              key={`${url}-${i}`}
              data-testid={`product-image-item-${i}`}
              className="flex w-28 flex-col gap-1 rounded border border-gray-700 p-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`商品图片 ${i + 1}`}
                draggable={false}
                className="h-16 w-full rounded object-contain"
              />
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  className="text-gray-300 disabled:opacity-30"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === images.length - 1}
                  className="text-gray-300 disabled:opacity-30"
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className="text-red-400"
                  aria-label="移除"
                >
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => handleUpload(e.target.files)}
          className="text-xs text-gray-300"
          aria-label="上传商品图片"
        />
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:border-gray-400"
        >
          {pickerOpen ? "收起媒体库" : "从媒体库选择"}
        </button>
        {busy && <span className="text-xs text-gray-400">上传中…</span>}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {pickerOpen && (
        <div className="max-h-72 overflow-y-auto rounded border border-gray-700 p-2">
          <MediaAssetList
            refreshKey={refreshKey}
            onPick={(asset) => append([asset.url])}
          />
        </div>
      )}
    </div>
  );
}
