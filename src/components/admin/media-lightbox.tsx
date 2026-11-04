"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  ExternalLink,
  X,
} from "lucide-react";
import type { MediaAssetItem } from "@/components/admin/media-library";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { errorMessage, requestJson } from "@/lib/api-client";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * 媒体大图查看器(WP 媒体库式):全屏 overlay + 适应/1:1 切换 + 左右切换 +
 * 复制 URL/新窗口原图/删除;Esc/点背景关闭。onDelete 缺省=纯预览(选择模式)。
 */
export function MediaLightbox({
  items,
  index,
  onClose,
  onIndexChange,
  onDeleted,
}: {
  items: MediaAssetItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (next: number) => void;
  onDeleted?: (asset: MediaAssetItem) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current: MediaAssetItem | undefined = items[index];

  const go = useCallback(
    (delta: number) => {
      if (items.length === 0) return;
      onIndexChange((index + delta + items.length) % items.length);
      setZoomed(false);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!current) return null;
  const asset = current;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("复制失败,请手动选择地址。");
    }
  }

  async function remove() {
    if (!window.confirm(`确认删除「${asset.originalName}」?若正文曾引用该文件,相应位置的图片将变成死链。`)) {
      return;
    }
    setError(null);
    try {
      await requestJson(`/api/admin/media/${asset.id}`, { method: "DELETE" });
      onDeleted?.(asset);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div
      role="dialog"
      aria-label={`媒体预览:${asset.originalName}`}
      className="fixed inset-0 z-[60] flex flex-col bg-black/85"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5 text-[13px] text-white/90">
        <span className="min-w-0 truncate font-medium">{asset.originalName}</span>
        <span className="text-white/50">{formatSize(asset.sizeBytes)}</span>
        <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-white/70">
          {asset.category}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomed((v) => !v)}
            title={zoomed ? "适应窗口" : "原始尺寸 1:1"}
            className={`rounded-lg border border-white/20 p-1.5 text-white/80 hover:bg-white/10 ${FOCUS_RING}`}
          >
            {zoomed ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={copyUrl}
            title="复制 URL"
            className={`rounded-lg border border-white/20 p-1.5 text-white/80 hover:bg-white/10 ${FOCUS_RING}`}
          >
            <Copy aria-hidden="true" className="h-4 w-4" />
          </button>
          <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            title="新窗口打开原图"
            className={`rounded-lg border border-white/20 p-1.5 text-white/80 hover:bg-white/10 ${FOCUS_RING}`}
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
          {onDeleted && (
            <button
              type="button"
              onClick={remove}
              className="rounded-lg border border-[#eda9a9]/50 bg-[#eda9a9]/10 px-2.5 py-1.5 text-xs text-[#eda9a9] hover:bg-[#eda9a9]/20"
            >
              删除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="关闭(Esc)"
            className={`rounded-lg border border-white/20 p-1.5 text-white/80 hover:bg-white/10 ${FOCUS_RING}`}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.originalName}
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomed((v) => !v);
          }}
          className={
            zoomed
              ? "max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain"
          }
        />
        {items.length > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={() => go(-1)}
              className={`absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2 text-white/90 hover:bg-black/70 ${FOCUS_RING}`}
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={() => go(1)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 p-2 text-white/90 hover:bg-black/70 ${FOCUS_RING}`}
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
              {index + 1} / {items.length}
            </span>
          </>
        )}
      </div>

      <footer className="flex items-center gap-3 border-t border-white/10 px-4 py-2 text-xs text-white/50">
        <span>← → 切换 · Esc 关闭 · 点击图片切换 1:1</span>
        {copied && <span className="text-[#6ee7b7]">URL 已复制</span>}
        {error && <span className="text-[#eda9a9]">{error}</span>}
      </footer>
    </div>
  );
}
