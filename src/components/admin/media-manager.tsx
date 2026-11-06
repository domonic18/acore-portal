"use client";

import { useState } from "react";
import {
  MediaAssetList,
  MediaCategorySelect,
  uploadMediaFiles,
} from "@/components/admin/media-library";
import { Dropzone } from "@/components/ui/dropzone";
import { MEDIA_DEFAULT_CATEGORY } from "@/constants/media";

/** 媒体库管理台(T033):Dropzone 上传(拖放/点选,可选分类)+列表+删除;删除二次确认提示正文死链风险(FR-217) */
export function MediaManager() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [category, setCategory] = useState<string>(MEDIA_DEFAULT_CATEGORY);

  async function handleUpload(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const items = await uploadMediaFiles(files, category);
      // 视频由服务端按 mime 强制落「视频」分类,回显实际落库分类而非所选
      const actual = items[0]?.category ?? category;
      setMessage(`已上传 ${items.length} 个文件到「${actual}」。`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Dropzone onFiles={(files) => void handleUpload(files)} busy={busy} />
        <div className="flex flex-col gap-2 text-sm">
          <MediaCategorySelect value={category} onChange={setCategory} />
          {message && (
            <span className="text-[13px] text-[#6ee7b7]" role="status">
              {message}
            </span>
          )}
          {error && (
            <span role="alert" className="text-[13px] text-[#eda9a9]">
              {error}
            </span>
          )}
          <p className="max-w-xs text-xs leading-5 text-[#6482a3]">
            图片与 PDF(单文件 ≤10MB)、视频 mp4/webm(单文件 ≤50MB);
            同内容文件只存一份(按内容哈希幂等)。删除后正文引用位置会变成死链,请先确认。
          </p>
        </div>
      </div>
      <MediaAssetList
        refreshKey={refreshKey}
        onDelete={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
