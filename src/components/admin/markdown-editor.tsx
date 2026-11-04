"use client";

import { useEffect, useRef, useState } from "react";
import MDEditor, { commands } from "@uiw/react-md-editor";
import { Eye, EyeOff, Image as ImageIcon, Library } from "lucide-react";
import { uploadMediaFiles } from "@/components/admin/media-library";
import { MediaPickerModal } from "@/components/admin/media-picker-modal";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { useHydrated } from "@/lib/use-hydrated";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import type { TocItem } from "@/lib/markdown";

/**
 * Markdown 编辑器(FR-215;2026-11-03 升级 @uiw/react-md-editor):
 * 专业工具栏(选中包裹/撤销重做/表格代码块等)+全高编辑区;预览面板走
 * /api/admin/markdown-preview 与前台同管线同白名单(400ms 防抖,可收起/并排);
 * 粘贴图片自动上传媒体库插 CDN URL;「媒体库」弹层选图插入光标处。
 */

type PreviewData = { html: string; toc: TocItem[] };

const PLACEHOLDER = "正文 Markdown(GFM:表格/代码块/删除线均支持)…";

// 内置预览/帮助键关掉(预览用自家白名单面板);保留编辑类命令
const TOOLBAR_COMMANDS = [
  commands.title,
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.table,
  commands.divider,
  commands.link,
  commands.image,
];

export function MarkdownEditor({
  value,
  onChange,
  height = 480,
  withPreview = true,
}: {
  value: string;
  onChange: (v: string) => void;
  /** 编辑区高度(紧凑场景如版块说明传 280) */
  height?: number;
  /** 是否提供预览面板(紧凑场景可关) */
  withPreview?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [split, setSplit] = useState(withPreview);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const seqRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 实时预览:输入停顿 400ms 后请求;seq 丢弃过期响应(快输时旧响应不覆盖新预览)
  useEffect(() => {
    if (!split) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (value.trim() === "") {
        setPreview(null);
        return;
      }
      try {
        const body = await requestJson<PreviewData>("/api/admin/markdown-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bodyMd: value }),
        });
        if (seq !== seqRef.current) return;
        setPreview(body);
      } catch (err) {
        if (seq !== seqRef.current) return;
        // 网络瞬断:保留上次预览,不打断输入
        if (err instanceof ApiRequestError) setError(err.message);
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, split]);

  function currentTextarea(): HTMLTextAreaElement | null {
    return wrapRef.current?.querySelector("textarea") ?? null;
  }

  function insert(snip: string, cursor = snip.length) {
    const ta = currentTextarea();
    if (!ta) {
      onChange(value + snip);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    onChange(value.slice(0, start) + snip + value.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + cursor;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files).filter(
      (f) => f.type.startsWith("image/") || f.type === "application/pdf",
    );
    if (files.length === 0) return;
    e.preventDefault();
    setUploading(true);
    setError(null);
    try {
      const assets = await uploadMediaFiles(files);
      for (const asset of assets) {
        insert(asset.mimeType.startsWith("image/") ? `![](${asset.url})\n` : `[附件](${asset.url})\n`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "粘贴上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="markdown-editor" data-color-mode="dark">
      <style>{`.admin-md .w-md-editor { background-color: #0b1526; }
.admin-md .w-md-editor-text-pre > code, .admin-md .w-md-editor-text-input, .admin-md .w-md-editor-text { font-size: 14px !important; line-height: 1.7 !important; }
.admin-md .w-md-editor-toolbar { background-color: #13233a; border-bottom-color: #22385a; }
.admin-md .w-md-editor-toolbar li button { color: #93b2ce; }
.admin-md .w-md-editor-toolbar li.active button, .admin-md .w-md-editor-toolbar li button:hover { color: #dcebf7; background-color: #16283f; }
.admin-md .w-md-editor-input, .admin-md .w-md-editor-preview { box-shadow: none; }
.admin-md textarea.w-md-editor-text-input { color: #dcebf7; caret-color: #6fb7e0; }
.admin-md .w-md-editor textarea::placeholder { color: #6482a3; }`}</style>

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Markdown 工具栏">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#22385a] bg-[#13233a] px-3 py-1.5 text-xs text-[#93b2ce] transition hover:border-[#6fb7e0]/50 hover:text-[#dcebf7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
        >
          <Library aria-hidden="true" className="h-3.5 w-3.5" />
          媒体库…
        </button>
        {uploading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#93b2ce]">
            <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 animate-pulse" />
            图片上传中…
          </span>
        )}
        {error && (
          <p role="alert" className="text-xs text-[#eda9a9]">
            {error}
          </p>
        )}
        {withPreview && (
        <button
          type="button"
          onClick={() => setSplit((v) => !v)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[#6fb7e0]/50 bg-[#6fb7e0]/10 px-3 py-1.5 text-xs font-semibold text-[#a8d9f5] transition hover:bg-[#6fb7e0]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
        >
          {split ? (
            <>
              <EyeOff aria-hidden="true" className="h-3.5 w-3.5" />
              收起预览
            </>
          ) : (
            <>
              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              展开预览
            </>
          )}
        </button>
        )}
      </div>

      <div ref={wrapRef} className={`admin-md ${split ? "grid items-start gap-3 lg:grid-cols-2" : ""}`}>
        <div className="overflow-hidden rounded-lg border border-[#22385a]">
          {hydrated ? (
          <MDEditor
            value={value}
            onChange={(v) => onChange(v ?? "")}
            preview="edit"
            commands={TOOLBAR_COMMANDS}
            extraCommands={[]}
            textareaProps={{ placeholder: PLACEHOLDER, onPaste }}
            height={height}
            visibleDragbar={false}
          />
          ) : (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onPaste={onPaste}
              style={{ height }}
              className="w-full resize-none bg-[#0b1526] p-3 font-mono text-sm text-[#dcebf7] outline-none placeholder:text-[#6482a3]"
              placeholder={PLACEHOLDER}
            />
          )}
        </div>
        {split && withPreview && (
          <div
            style={{ height }}
            className="overflow-y-auto rounded-lg border border-[#22385a] bg-[#0b1526] p-4"
            data-testid="markdown-preview"
          >
            {preview && preview.toc.length > 0 && (
              <nav aria-label="目录预览" className="mb-3 border-b border-[#22385a] pb-2 text-xs">
                <p className="mb-1 font-medium text-[#e8c877]">目录</p>
                <ul className="space-y-0.5">
                  {preview.toc.map((item) => (
                    <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 12 }}>
                      <span className="text-[#93b2ce]">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            {preview ? (
              <div
                className={MARKDOWN_BODY_CLS}
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            ) : (
              <p className="text-xs text-[#6482a3]">
                {value.trim() === "" ? "左侧输入 Markdown 后此处实时预览" : "预览生成中…"}
              </p>
            )}
          </div>
        )}
      </div>
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onInsert={(md) => insert(md)}
      />
    </div>
  );
}
