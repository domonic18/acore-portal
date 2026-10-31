"use client";

import { useRef, useState } from "react";
import {
  MediaAssetList,
  MediaCategorySelect,
  uploadMediaFiles,
} from "@/components/admin/media-library";
import { MEDIA_DEFAULT_CATEGORY } from "@/constants/media";

/** 媒体库管理台(T033):上传(可选分类)+列表+删除;删除二次确认提示正文死链风险(FR-217) */
export function MediaManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [category, setCategory] = useState<string>(MEDIA_DEFAULT_CATEGORY);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const items = await uploadMediaFiles(Array.from(files), category);
      setMessage(`已上传 ${items.length} 个文件到「${category}」。`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-400">
        图片与 PDF(单文件 ≤10MB);同内容文件只存一份(按内容哈希幂等)。
        删除后正文引用位置会变成死链,请先确认。
      </p>
      <div className="flex items-center gap-3 text-sm">
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
        {busy && <span className="text-gray-400">上传中…</span>}
        {message && <span className="text-green-400">{message}</span>}
        {error && (
          <span role="alert" className="text-red-400">
            {error}
          </span>
        )}
      </div>
      <MediaAssetList
        refreshKey={refreshKey}
        onDelete={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
