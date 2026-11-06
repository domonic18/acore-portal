"use client";

import type { Draft } from "./draft-types";
import { MediaPickerField } from "@/components/admin/media-picker-field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

/** 轮播编辑卡共用料字段(标题/链接/图片/启用),编辑与新建两态共用 */
export function BannerEditorFields({
  draft,
  setDraft,
  disabled,
}: {
  draft: Draft;
  setDraft: (updater: (prev: Draft) => Draft) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
        标题(可空=纯图无文案)
        <Input
          value={draft.title}
          onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-[#93b2ce]">
        跳转链接(可空)
        <Input
          value={draft.linkUrl}
          onChange={(e) => setDraft((p) => ({ ...p, linkUrl: e.target.value }))}
          placeholder="https://…"
        />
      </label>
      <span className="flex flex-col gap-1 text-xs text-[#93b2ce] sm:col-span-2">
        图片(媒体库选图/上传,即时预览)
        <MediaPickerField value={draft.imageUrl} onChange={(url) => setDraft((p) => ({ ...p, imageUrl: url }))} disabled={disabled} />
      </span>
      <label className="flex items-center gap-2 text-xs text-[#93b2ce]">
        启用
        <Switch checked={draft.enabled} onChange={(v) => setDraft((p) => ({ ...p, enabled: v }))} ariaLabel="启用轮播物料" />
      </label>
    </div>
  );
}

/** 编辑态图片即时预览(16:5 与前台轮播位同比例) */
export function BannerImagePreview({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="图片预览"
      className="mb-3 aspect-[16/5] w-full rounded-lg border border-[#22385a] object-cover"
    />
  );
}
