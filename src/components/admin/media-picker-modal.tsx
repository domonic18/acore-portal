"use client";

import { useState } from "react";
import { MEDIA_DEFAULT_CATEGORY } from "@/constants/media";
import {
  MediaAssetList,
  MediaCategorySelect,
  uploadMediaFiles,
} from "@/components/admin/media-library";
import { Dropzone } from "@/components/ui/dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * 媒体库选择弹窗(Radix Dialog):焦点陷阱/ESC/滚动锁定由底座接管;
 * data-admin-scope 让 Portal 弹层吃到后台深色令牌。open=false 时 Portal
 * 不渲染,列表状态随关随清,与旧实现一致。
 */
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

  async function handleUpload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadMediaFiles(files, category);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        data-admin-scope
        className="max-h-[85vh] max-w-2xl overflow-y-auto p-4"
      >
        <DialogHeader className="mb-3">
          <DialogTitle>媒体库</DialogTitle>
          <DialogDescription className="sr-only">
            选择已有素材或上传新文件,图片点击即可插入正文。
          </DialogDescription>
        </DialogHeader>
        <div className="mb-3 grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Dropzone onFiles={(files) => void handleUpload(files)} busy={busy} />
          <div className="flex flex-col gap-2">
            <MediaCategorySelect value={category} onChange={setCategory} />
            {busy && <span className="text-xs text-[#93b2ce]">上传中…</span>}
            {error && (
              <span role="alert" className="text-xs text-[#eda9a9]">
                {error}
              </span>
            )}
          </div>
        </div>
        <MediaAssetList
          refreshKey={refreshKey}
          /* 视频不进 Markdown:正文渲染走 rehype-sanitize,裸 <video> 会被剥掉,
             ![](url) 插视频地址也只会渲染成坏图——视频只作后台素材,不入正文 */
          canPick={(asset) => !asset.mimeType.startsWith("video/")}
          onPick={(asset) => {
            onInsert(`![](${asset.url})\n`);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
