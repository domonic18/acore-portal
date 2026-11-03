"use client";

import { useRef, useState } from "react";
import {
  MediaAssetList,
  uploadMediaFiles,
} from "@/components/admin/media-library";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/** 商品图分类(对齐旧站 FileBird 一级文件夹;媒体库列表/上传均默认落此分类) */
const PRODUCT_CATEGORY = "商店配图";

/**
 * 商品图片编辑器(WP featured image 对齐,FR-126 扩展):
 * 上传/媒体库选图追加到有序列表(首图=主图,商城卡与详情主图);
 * 媒体库默认筛「商店配图」;上移/下移/移除;图片加载失败缩略显占位。
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
      const assets = await uploadMediaFiles(Array.from(files), PRODUCT_CATEGORY);
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
      <span className="text-[#93b2ce]">商品图片(首图=主图,最多 20 张)</span>
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <li
              key={`${url}-${i}`}
              data-testid={`product-image-item-${i}`}
              className="flex w-28 flex-col gap-1 rounded-lg border border-[#22385a] bg-[#13233a] p-1"
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
                  className={`rounded text-[#93b2ce] hover:text-[#dcebf7] disabled:opacity-30 ${FOCUS_RING}`}
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === images.length - 1}
                  className={`rounded text-[#93b2ce] hover:text-[#dcebf7] disabled:opacity-30 ${FOCUS_RING}`}
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  className={`rounded text-[#eda9a9] hover:text-[#f3c5c5] ${FOCUS_RING}`}
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
          className="text-xs text-[#93b2ce]"
          aria-label="上传商品图片"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPickerOpen((v) => !v)}
        >
          {pickerOpen ? "收起媒体库" : "从媒体库选择"}
        </Button>
        {busy && <span className="text-xs text-[#93b2ce]">上传中…</span>}
      </div>
      {error && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </p>
      )}
      {pickerOpen && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[#22385a] bg-[#0b1526] p-2">
          <MediaAssetList
            refreshKey={refreshKey}
            defaultCategory={PRODUCT_CATEGORY}
            onPick={(asset) => append([asset.url])}
          />
        </div>
      )}
    </div>
  );
}
