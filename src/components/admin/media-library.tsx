"use client";

import { useEffect, useRef, useState } from "react";
import { MEDIA_CATEGORIES, MEDIA_DEFAULT_CATEGORY } from "@/constants/media";
import { prepareUploadFile } from "@/lib/media/prepare-upload";
import { Input, Select } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { MediaLightbox } from "@/components/admin/media-lightbox";
import { errorMessage, requestJson } from "@/lib/api-client";

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

type UploadResponse = {
  items?: MediaAssetItem[];
};

type MediaListResponse = {
  items: MediaAssetItem[];
  total: number;
  totalPages: number;
  counts: Record<string, number>;
};

export async function uploadMediaFiles(
  files: File[],
  category?: string,
): Promise<MediaAssetItem[]> {
  // 大图先压缩:公网测试栈 nginx 1m 限制会直接返回 HTML 413
  const prepared = await Promise.all(files.map(prepareUploadFile));
  const fd = new FormData();
  for (const f of prepared) fd.append("files", f);
  if (category) fd.append("category", category);
  const body = await requestJson<UploadResponse>("/api/admin/media", {
    method: "POST",
    body: fd,
  });
  if (!body.items) throw new Error("上传响应异常,请稍后重试。");
  return body.items;
}

export function MediaAssetList({
  onPick,
  onDelete,
  refreshKey = 0,
  defaultCategory = "",
  kind,
  canPick,
}: {
  onPick?: (asset: MediaAssetItem) => void;
  onDelete?: () => void;
  refreshKey?: number;
  /** 初始分类(如商品配图入口默认「商店配图」);空=全部 */
  defaultCategory?: string;
  /** 服务端按 mime 前缀过滤:图片位只列 image/*,视频位只列 video/* */
  kind?: "image" | "video";
  /** 该资产是否可选取;缺省=全部可选取(视频不可插入 Markdown) */
  canPick?: (asset: MediaAssetItem) => boolean;
}) {
  const CHIP_BTN =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] transition select-none";
  const CHIP_ACTIVE = "border-[#6fb7e0] bg-[#6fb7e0]/15 font-medium text-[#a8d9f5]";
  const CHIP_IDLE = "border-[#22385a] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]";
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
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (category && !kind) params.set("category", category);
    if (kind) params.set("kind", kind);
    requestJson<MediaListResponse>(`/api/admin/media?${params.toString()}`)
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch(() => setError("媒体列表加载失败"));
    return () => {
      cancelled = true;
    };
  }, [q, page, category, kind, refreshKey]);

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
    try {
      await requestJson(`/api/admin/media/${asset.id}`, { method: "DELETE" });
    } catch (err) {
      setError(errorMessage(err));
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
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="搜索文件名…"
          className="w-56"
        />
        <span className="shrink-0 whitespace-nowrap text-[#6482a3]">共 {data?.total ?? "…"} 个</span>
      </div>
      {tabs.length > 0 && !kind && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="媒体分类">
          <button
            type="button"
            aria-pressed={category === ""}
            onClick={() => {
              setCategory("");
              setPage(1);
            }}
            className={`${CHIP_BTN} ${category === "" ? CHIP_ACTIVE : CHIP_IDLE} ${FOCUS_RING}`}
          >
            全部
          </button>
          {tabs.map(([name, count]) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => {
                setCategory(name);
                setPage(1);
              }}
              className={`${CHIP_BTN} ${category === name ? CHIP_ACTIVE : CHIP_IDLE} ${FOCUS_RING}`}
            >
              {name}({count})
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[#eda9a9]">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {(data?.items ?? []).map((asset, index) => (
          <li key={asset.id} className="group relative overflow-hidden rounded-lg border border-[#22385a] bg-[#13233a]">
            <div className="relative aspect-[4/3]">
              {asset.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.url}
                  alt={asset.originalName}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full cursor-zoom-in object-cover"
                  onClick={() => setViewer(index)}
                />
              ) : asset.mimeType.startsWith("video/") ? (
                /* 视频缩略图:不挂 controls,点击进灯箱播放(预载 metadata 够取首帧) */
                <video
                  src={asset.url}
                  className="absolute inset-0 h-full w-full cursor-zoom-in object-cover"
                  preload="metadata"
                  muted
                  playsInline
                  onClick={() => setViewer(index)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setViewer(index)}
                  className="absolute inset-0 flex items-center justify-center text-[#6482a3]"
                >
                  PDF
                </button>
              )}
              {onPick && (canPick?.(asset) ?? true) && (
                <button
                  type="button"
                  onClick={() => onPick(asset)}
                  title="点击插入"
                  className="absolute inset-0 flex items-end justify-center bg-[#081120]/60 pb-3 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <span className="rounded-lg bg-[#6fb7e0] px-3 py-1 text-xs font-semibold text-[#081120]">
                    插入
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-1 px-2 py-1.5">
              <span className="min-w-0 truncate text-xs text-[#dcebf7]" title={asset.originalName}>
                {asset.originalName}
              </span>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => remove(asset)}
                  className={`shrink-0 rounded text-xs text-[#eda9a9] underline-offset-2 hover:text-[#f3c5c5] hover:underline ${FOCUS_RING}`}
                >
                  删除
                </button>
              ) : (
                <span className="shrink-0 text-[10.5px] text-[#6482a3]">
                  {asset.sizeBytes >= 1024 * 1024
                    ? `${(asset.sizeBytes / 1024 / 1024).toFixed(1)}MB`
                    : `${Math.max(1, Math.round(asset.sizeBytes / 1024))}KB`}
                </span>
              )}
            </div>
          </li>
        ))}
        {(data?.items ?? []).length === 0 && (
          <li className="col-span-full py-10 text-center text-[13px] text-[#6482a3]">没有匹配的文件。</li>
        )}
      </ul>
      {viewer !== null && data && (
        <MediaLightbox
          items={data.items}
          index={Math.min(viewer, data.items.length - 1)}
          onClose={() => setViewer(null)}
          onIndexChange={setViewer}
          onDeleted={
            onDelete
              ? (asset) => {
                  setData((prev) =>
                    prev ? { ...prev, items: prev.items.filter((i) => i.id !== asset.id), total: prev.total - 1 } : prev,
                  );
                  setViewer(null);
                  onDelete();
                }
              : undefined
          }
        />
      )}
      {(data?.totalPages ?? 1) > 1 && (
        <div className="flex items-center gap-3 text-xs text-[#93b2ce]">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={`rounded text-[#6fb7e0] hover:text-[#a8d9f5] disabled:opacity-40 ${FOCUS_RING}`}
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
            className={`rounded text-[#6fb7e0] hover:text-[#a8d9f5] disabled:opacity-40 ${FOCUS_RING}`}
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
    <label className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-[#93b2ce]">
      上传分类
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-auto py-1 pr-7 text-xs"
      >
        {MEDIA_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </label>
  );
}
