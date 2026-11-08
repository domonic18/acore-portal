"use client";

import { useRef, useState } from "react";
import { MediaAssetList, uploadMediaFiles } from "@/components/admin/media-library";
import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { MEDIA_CATEGORY_SHOP } from "@/constants/media";

/**
 * 商品图片面板(编辑台右栏):
 * 大图预览 + 点击大图直接替换主图;缩略图条支持设为主图/上移/下移/移除;
 * 底部可追加上传或从媒体库选取(默认筛「商店配图」)。
 * 首图 = 主图(商城卡与详情主图)。
 */
export function ProductImagePanel({
  images,
  onChange,
  error,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  error?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"append" | "replace" | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  }

  function setMain(index: number) {
    if (index <= 0 || index >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.unshift(item);
    onChange(next);
  }

  function append(urls: string[]) {
    onChange([...images, ...urls.filter((u) => !images.includes(u))]);
  }

  function replaceMain(url: string) {
    if (images.length === 0) {
      onChange([url]);
      return;
    }
    onChange([url, ...images.slice(1).filter((u) => u !== url)]);
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setUploadError(null);
    try {
      const assets = await uploadMediaFiles(Array.from(files), MEDIA_CATEGORY_SHOP);
      append(assets.map((a) => a.url));
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const main = images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-[#93b2ce]">商品图片</span>
        <span className="text-xs text-[#6482a3]">首图即主图,最多 20 张</span>
      </div>

      {main ? (
        <button
          type="button"
          onClick={() => setPicker("replace")}
          className={`group relative block aspect-square w-full overflow-hidden rounded-lg border border-[#22385a] bg-[#0b1526] ${FOCUS_RING}`}
          aria-label="替换主图"
          title="点击替换主图"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={main}
            alt="商品主图"
            draggable={false}
            className="h-full w-full object-contain p-2"
          />
          <span className="absolute inset-x-0 bottom-0 bg-[#0b1526]/85 py-1 text-center text-xs text-[#a8d9f5] opacity-0 transition group-hover:opacity-100">
            点击替换主图
          </span>
        </button>
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#22385a] bg-[#0b1526] text-xs text-[#6482a3]">
          <span className="text-3xl">🖼</span>
          <span>暂无图片,点击下方「上传图片」或「从媒体库选择」</span>
        </div>
      )}

      {images.length > 1 && (
        <ul className="flex flex-wrap gap-2">
          {images.map((url, i) => (
            <li
              key={`${url}-${i}`}
              data-testid={`product-image-item-${i}`}
              className="flex w-20 flex-col gap-1 rounded-lg border border-[#22385a] bg-[#0b1526] p-1"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`商品图片 ${i + 1}`}
                draggable={false}
                className="h-14 w-full rounded object-contain"
              />
              {i === 0 && (
                <span className="text-center text-[10px] text-[#6ee7b7]">主图</span>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  aria-label="上移"
                  className={`rounded text-[#93b2ce] hover:text-[#dcebf7] disabled:opacity-30 ${FOCUS_RING}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => setMain(i)}
                  disabled={i === 0}
                  aria-label="设为主图"
                  className={`rounded text-[#93b2ce] hover:text-[#dcebf7] disabled:opacity-30 ${FOCUS_RING}`}
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  disabled={i === images.length - 1}
                  aria-label="下移"
                  className={`rounded text-[#93b2ce] hover:text-[#dcebf7] disabled:opacity-30 ${FOCUS_RING}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                  aria-label="移除"
                  className={`rounded text-[#eda9a9] hover:text-[#f3c5c5] ${FOCUS_RING}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          disabled={busy}
          onChange={(e) => void handleUpload(e.target.files)}
          className="text-xs text-[#93b2ce]"
          aria-label="上传商品图片"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPicker(picker === "append" ? null : "append")}
        >
          {picker === "append" ? "收起媒体库" : "从媒体库选择"}
        </Button>
        {busy && <span className="text-xs text-[#93b2ce]">上传中…</span>}
      </div>

      {(uploadError || error) && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {uploadError ?? error}
        </p>
      )}

      {picker && (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[#22385a] bg-[#0b1526] p-2">
          <p className="mb-1 text-xs text-[#93b2ce]">
            {picker === "replace" ? "选择一张图片替换主图" : "选择图片追加到图片列表"}
          </p>
          <MediaAssetList
            refreshKey={refreshKey}
            defaultCategory={MEDIA_CATEGORY_SHOP}
            onPick={(asset) => {
              if (picker === "replace") replaceMain(asset.url);
              else append([asset.url]);
            }}
          />
        </div>
      )}
    </div>
  );
}
