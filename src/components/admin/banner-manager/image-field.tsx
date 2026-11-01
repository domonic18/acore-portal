"use client";

import { useRef, useState } from "react";
import { MediaAssetList, uploadMediaFiles } from "@/components/admin/media-library";

/** 图片字段:手填 + 媒体库选图(上传/选择复用媒体库) */
export function ImageField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/images/… 或 https://…"
          className="w-72 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-400 disabled:opacity-50"
        >
          {open ? "收起媒体库" : "从媒体库选图"}
        </button>
      </div>
      {open && (
        <div className="rounded border border-gray-700 p-2">
          <div className="mb-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading || disabled}
              onChange={async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;
                setUploading(true);
                setUploadError(null);
                try {
                  const uploaded = await uploadMediaFiles(Array.from(files));
                  onChange(uploaded[0]?.url ?? value);
                  setRefreshKey((k) => k + 1);
                } catch (err) {
                  setUploadError(err instanceof Error ? err.message : "上传失败");
                } finally {
                  setUploading(false);
                  if (fileRef.current) fileRef.current.value = "";
                }
              }}
              className="text-xs text-gray-300"
            />
            {uploading && <span className="text-xs text-gray-400">上传中…</span>}
            {uploadError && (
              <span role="alert" className="text-xs text-red-400">
                {uploadError}
              </span>
            )}
          </div>
          <MediaAssetList
            refreshKey={refreshKey}
            onPick={(asset) => {
              onChange(asset.url);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
