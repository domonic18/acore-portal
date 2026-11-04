"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

const MAX_CONTENT = 20_000;

/**
 * 论坛发帖/回帖共用正文编辑器(#34):textarea + 图片上传(拖放/点选,
 * 上传成功在光标处插 Markdown 图片) + 字数统计。前台配色。
 */
export function MarkdownComposer({
  value,
  onChange,
  placeholder = "支持 Markdown 语法…",
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  function insertAtCursor(snip: string) {
    const ta = taRef.current;
    if (!ta) {
      onChange(value + snip);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    onChange(value.slice(0, start) + snip + value.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + snip.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const body = await requestJson<{ items: { url: string }[] }>("/api/forum/upload", {
        method: "POST",
        body: fd,
      });
      for (const item of body.items) insertAtCursor(`\n![](${item.url})\n`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#22385a] bg-[#13233a] px-3 py-1.5 text-xs text-[#93b2ce] transition hover:border-[#6fb7e0]/50 hover:text-[#dcebf7] ${FOCUS_RING} ${
            uploading ? "opacity-60" : ""
          }`}
        >
          <ImagePlus aria-hidden="true" className="h-3.5 w-3.5" />
          {uploading ? "上传中…" : "上传图片"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <span className="ml-auto text-[11.5px] text-[#6482a3]">
          {value.length}/{MAX_CONTENT}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </p>
      )}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_CONTENT))}
        rows={rows}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-[#22385a] bg-[#0d1828] p-3 font-mono text-sm leading-6 text-[#dcebf7] placeholder:text-[#6482a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60 ${FOCUS_RING}`}
      />
    </div>
  );
}
