"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { FOCUS_RING } from "./admin-tokens";
import { cn } from "@/lib/cn";

/**
 * 拖放上传区(2026-11-03 用户反馈:裸 file input 像 label 不像控件):
 * 虚线框+图标+点击选择/拖放两用;onFiles 上抛由调用方执行上传。
 * busy 时禁用;acceptedTypes 提示文案透传。
 */
export function Dropzone({
  onFiles,
  disabled = false,
  busy = false,
  accept = "image/*,application/pdf,video/mp4,video/webm",
  multiple = true,
  hint = "支持图片 / PDF / 视频(mp4、webm),单次可多选",
  className = "",
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  busy?: boolean;
  accept?: string;
  multiple?: boolean;
  hint?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function emit(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length > 0) onFiles(list);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled && !busy) emit(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-6 py-6 text-center transition",
        FOCUS_RING,
        dragOver
          ? "border-primary bg-primary/10"
          : "border-border bg-background/60 hover:border-primary/50",
        (disabled || busy) && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || busy}
        onChange={(e) => emit(e.target.files)}
        className="sr-only"
      />
      <UploadCloud
        aria-hidden="true"
        className={cn("h-6 w-6 text-primary", busy && "animate-pulse")}
      />
      <span className="text-[13px] font-medium text-foreground">
        {busy ? "上传中…" : "点击选择或拖拽文件到此处"}
      </span>
      <span className="text-[11.5px] text-faint-foreground">{hint}</span>
    </label>
  );
}
