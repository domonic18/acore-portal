"use client";

import { useState } from "react";
import { MEDIA_DEFAULT_CATEGORY } from "@/constants/media";
import {
  MediaAssetList,
  MediaCategorySelect,
  uploadMediaFiles,
} from "@/components/admin/media-library";
import { Dropzone } from "@/components/ui/dropzone";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

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

  if (!open) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#22385a] bg-[#0b1526] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-[#e8c877]">媒体库</h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded text-[#6482a3] hover:text-[#dcebf7] ${FOCUS_RING}`}
          >
            关闭
          </button>
        </div>
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
          onPick={(asset) => {
            onInsert(`![](${asset.url})\n`);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
