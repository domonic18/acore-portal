"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ImagePlus } from "lucide-react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { FORUM_POST_BODY_CLS } from "@/constants/content";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

const MAX_CONTENT = 20_000;

/**
 * 论坛发帖/回帖共用正文编辑器(#34):textarea + 图片上传(上传成功在光标处
 * 插站内 Markdown 图片)+ 编写/预览切换(预览走 /api/forum/preview,
 * 与前台同管线白名单,所见即所得——上传的图片直接渲染为图片)。
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
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 预览:输入停顿 400ms 后请求;seq 丢弃过期响应
  useEffect(() => {
    if (!showPreview) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (value.trim() === "") {
        setPreviewHtml("");
        return;
      }
      try {
        const body = await requestJson<{ html: string }>("/api/forum/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: value }),
        });
        if (seq === seqRef.current) setPreviewHtml(body.html);
      } catch {
        /* 预览失败静默,保留上次内容 */
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, showPreview]);

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
    <div className="flex flex-col gap-2" data-testid="forum-composer">
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
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${FOCUS_RING} ${
            showPreview
              ? "border-[#6fb7e0]/50 bg-[#6fb7e0]/10 font-semibold text-[#a8d9f5]"
              : "border-[#22385a] bg-[#13233a] text-[#93b2ce] hover:border-[#6fb7e0]/50 hover:text-[#dcebf7]"
          }`}
        >
          {showPreview ? (
            <>
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
              收起预览
            </>
          ) : (
            <>
              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              实时预览
            </>
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </p>
      )}
      <div className={`grid items-stretch gap-3 ${showPreview ? "lg:grid-cols-2" : ""}`}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CONTENT))}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#22385a] bg-[#0d1828] p-3 font-mono text-sm leading-6 text-[#dcebf7] placeholder:text-[#6482a3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
        />
        {showPreview && (
          <div
            className="max-h-[480px] min-h-[10rem] overflow-y-auto rounded-lg border border-[#22385a] bg-[#0d1828] p-4"
            data-testid="forum-composer-preview"
          >
            {previewHtml ? (
              <div
                className={FORUM_POST_BODY_CLS}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="text-xs text-[#6482a3]">
                {value.trim() === "" ? "左侧输入 Markdown 后此处实时预览" : "预览生成中…"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
