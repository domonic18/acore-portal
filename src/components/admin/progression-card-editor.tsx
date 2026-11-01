"use client";

import type { RefObject } from "react";
import { formatPhaseDate } from "@/components/site/progression-timeline";

/**
 * 渐进画布单卡(WYSIWYG):查看态复用前台卡片外观,编辑态原位展开表单。
 * 卡片位置/日期列由共用 ProgressionTimeline 负责,本组件只渲染卡片内容与工具栏。
 */
export type ProgressionDraftItem = {
  uid: string;
  id: string | null;
  title: string;
  phaseDate: string;
  imageUrl: string;
  bodyMd: string;
  status: "locked" | "open";
  icon: string;
};

const inputCls =
  "w-full rounded border border-[#35577f] bg-[#0d1828] px-2.5 py-1.5 text-[13px] text-[#dcebf7] placeholder:text-[#5a7392] focus:border-[#6fb7e0] focus:outline-none";

type Props = {
  item: ProgressionDraftItem;
  index: number;
  total: number;
  editing: boolean;
  busy: boolean;
  uploading: boolean;
  uploadError: string | null;
  isCurrent: boolean;
  canSetCurrent: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onEdit: () => void;
  onDone: () => void;
  onChange: (patch: Partial<ProgressionDraftItem>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onSetCurrent: () => void;
  onUpload: (files: FileList | null) => void;
};

export function ProgressionCardEditor({
  item,
  index,
  total,
  editing,
  busy,
  uploading,
  uploadError,
  isCurrent,
  canSetCurrent,
  fileInputRef,
  onEdit,
  onDone,
  onChange,
  onMove,
  onRemove,
  onSetCurrent,
  onUpload,
}: Props) {
  const border = editing
    ? "border-[#e8c877]/70 ring-2 ring-[#e8c877]/25"
    : isCurrent
      ? "border-[#e8c877]/60"
      : item.status === "locked"
        ? "border-[#2a4160]"
        : "border-[#35577f]";

  return (
    <article
      className={`relative scroll-mt-24 rounded-xl border bg-[#13233a] shadow-[0_10px_40px_rgba(0,0,0,0.35)] ${border}`}
      data-testid={item.id ? `progression-card-${item.id}` : `progression-card-new-${item.uid}`}
    >
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-[#35577f] bg-[#0a1220]/92 px-1 py-1 text-[11px] text-[#93b2ce] shadow backdrop-blur">
        <span className="px-1 text-[#6482a3]">#{index + 1}</span>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            className="rounded px-1.5 py-0.5 hover:bg-[#1d3350] hover:text-white"
          >
            编辑
          </button>
        )}
        <button
          type="button"
          aria-label="上移阶段"
          onClick={() => onMove(-1)}
          disabled={busy || index === 0}
          className="rounded px-1.5 py-0.5 hover:bg-[#1d3350] hover:text-white disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="下移阶段"
          onClick={() => onMove(1)}
          disabled={busy || index === total - 1}
          className="rounded px-1.5 py-0.5 hover:bg-[#1d3350] hover:text-white disabled:opacity-30"
        >
          ↓
        </button>
        {canSetCurrent && (
          <button
            type="button"
            onClick={onSetCurrent}
            className="rounded px-1.5 py-0.5 text-[#e8c877] hover:bg-[#1d3350]"
          >
            设为当前
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="rounded px-1.5 py-0.5 text-[#f08787] hover:bg-[#1d3350] disabled:opacity-30"
        >
          删除
        </button>
      </div>

      <div className="p-4 lg:p-5">
        {editing ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[12px] text-[#93b2ce]">
                阶段日期
                <input
                  data-testid="progression-date"
                  type="date"
                  value={item.phaseDate}
                  onChange={(e) => onChange({ phaseDate: e.target.value })}
                  className={inputCls}
                />
                <span className="text-[11px] text-[#6482a3]">留空 = 未定档</span>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-[#93b2ce]">
                开放状态
                <select
                  data-testid="progression-status"
                  value={item.status}
                  onChange={(e) =>
                    onChange({ status: e.target.value === "open" ? "open" : "locked" })
                  }
                  className={inputCls}
                >
                  <option value="locked">未开放</option>
                  <option value="open">开放</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] text-[#93b2ce]">
              阶段标题
              <input
                data-testid="progression-title"
                value={item.title}
                onChange={(e) => onChange({ title: e.target.value })}
                maxLength={128}
                placeholder="如:70级阶段 – 外域团本P5"
                className={`${inputCls} font-semibold`}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#93b2ce]">
              阶段说明(保留换行)
              <textarea
                data-testid="progression-body"
                value={item.bodyMd}
                onChange={(e) => onChange({ bodyMd: e.target.value })}
                rows={4}
                placeholder={"每行一条,如:\n团本:●熔火之心"}
                className={`${inputCls} leading-6`}
              />
            </label>
            <div className="flex flex-col gap-1 text-[12px] text-[#93b2ce]">
              配图(4:3)
              <div className="flex items-center gap-2">
                <input
                  data-testid="progression-image"
                  value={item.imageUrl}
                  onChange={(e) => onChange({ imageUrl: e.target.value })}
                  maxLength={500}
                  placeholder="上传或粘贴图片 URL"
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  className="shrink-0 rounded border border-[#35577f] px-3 py-1.5 text-[12px] text-[#a8d9f5] hover:border-[#6fb7e0] disabled:opacity-50"
                >
                  {uploading ? "上传中…" : "上传"}
                </button>
                {item.imageUrl && (
                  <button
                    type="button"
                    onClick={() => onChange({ imageUrl: "" })}
                    disabled={busy}
                    className="shrink-0 text-[12px] text-[#f08787] hover:text-[#ffb0b0] disabled:opacity-50"
                  >
                    清除
                  </button>
                )}
              </div>
              {uploadError && (
                <p data-testid="progression-upload-error" className="text-[12px] text-[#f08787]">
                  {uploadError}
                </p>
              )}
              {item.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.imageUrl}
                  alt="配图预览"
                  className="mt-1 aspect-[4/3] w-40 rounded-md border border-[#35577f] object-cover"
                />
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onDone}
                className="rounded bg-[#e8c877] px-4 py-1.5 text-[12.5px] font-semibold text-[#0a1220] hover:bg-[#f3d78f]"
              >
                完成编辑
              </button>
            </div>
          </div>
        ) : (
          <>
            {item.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                className="aspect-[4/3] w-full rounded-md object-cover"
              />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:hidden">
              <span className="text-[12.5px] text-[#cfc8c8]">
                {formatPhaseDate(item.phaseDate || null)}
              </span>
              <StateBadge isCurrent={isCurrent} status={item.status} />
            </div>
            <h2 className="text-[14.5px] font-bold leading-6 text-[#f3aa37] lg:text-[15px]">
              {item.title || "未命名阶段"}
            </h2>
            {item.bodyMd && (
              <p className="mt-1.5 whitespace-pre-line text-[13px] leading-6 text-[#93b2ce]">
                {item.bodyMd}
              </p>
            )}
            <div className="mt-2 hidden flex-wrap items-center gap-2 lg:flex">
              <StateBadge isCurrent={isCurrent} status={item.status} />
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function StateBadge({ isCurrent, status }: { isCurrent: boolean; status: "locked" | "open" }) {
  if (isCurrent) {
    return (
      <span className="rounded-full bg-[#e8c877]/12 px-2 py-0.5 text-[10.5px] text-[#e8c877]">
        当前阶段
      </span>
    );
  }
  if (status === "locked") {
    return (
      <span className="rounded-full bg-[#93b2ce]/12 px-2 py-0.5 text-[10.5px] text-[#93b2ce]">
        未开放
      </span>
    );
  }
  return null;
}
