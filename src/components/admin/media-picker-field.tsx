"use client";

import { useRef, useState } from "react";
import { MediaAssetList, uploadMediaFiles } from "@/components/admin/media-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * 媒体选图字段:手填地址 + 媒体库选图/上传。
 * 消费者:后台轮播物料编辑、站点主题背景设置(≥2 处故置于 components/admin 根目录)。
 */
export function MediaPickerField({
  value,
  onChange,
  disabled,
  placeholder = "/images/… 或 https://…",
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-72 py-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "收起媒体库" : "从媒体库选图"}
        </Button>
      </div>
      {open && (
        <div className="rounded-lg border border-[#22385a] bg-[#0b1526] p-2">
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
              className="text-xs text-[#93b2ce]"
            />
            {uploading && <span className="text-xs text-[#93b2ce]">上传中…</span>}
            {uploadError && (
              <span role="alert" className="text-xs text-[#eda9a9]">
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
