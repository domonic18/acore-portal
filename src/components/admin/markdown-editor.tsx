"use client";

import { useEffect, useRef, useState } from "react";
import { MediaPickerModal, uploadMediaFiles } from "@/components/admin/media-library";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import type { TocItem } from "@/lib/markdown";

/**
 * Markdown 编辑器(FR-215):默认左侧编辑、右侧实时预览(输入停顿 400ms 刷新,
 * 走 /api/admin/markdown-preview 与前台同管线同白名单,预览即所见);可收起
 * 预览切回单栏。GFM 工具栏光标处插入;粘贴图片自动上传媒体库插 CDN URL;
 * 「媒体库」弹层选图插入。
 */

const TOOLBAR: Array<{ label: string; title: string; snip: string; cursor?: number }> = [
  { label: "H2", title: "二级标题", snip: "## 标题\n", cursor: 3 },
  { label: "B", title: "加粗", snip: "**加粗文字**", cursor: 2 },
  { label: "I", title: "斜体", snip: "*斜体文字*", cursor: 1 },
  { label: "引用", title: "引用块", snip: "> 引用内容\n", cursor: 2 },
  { label: "代码", title: "行内代码", snip: "`代码`", cursor: 1 },
  { label: "代码块", title: "代码块(带高亮)", snip: "```ts\nconsole.log('hi');\n```\n", cursor: 6 },
  { label: "链接", title: "链接", snip: "[文本](https://)", cursor: 1 },
  { label: "图片", title: "图片(见媒体库按钮)", snip: "![描述](https://)", cursor: 3 },
  { label: "列表", title: "无序列表", snip: "- 列表项\n", cursor: 2 },
  {
    label: "表格",
    title: "GFM 表格",
    snip: "| 列 A | 列 B |\n| --- | --- |\n| 内容 | 内容 |\n",
    cursor: 2,
  },
];

type PreviewData = { html: string; toc: TocItem[] };

export function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [split, setSplit] = useState(true);
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
        const res = await fetch("/api/admin/markdown-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bodyMd: value }),
        });
        const body = await res.json();
        if (seq !== seqRef.current) return;
        if (!res.ok) {
          setError(body?.error?.message ?? "预览失败");
          return;
        }
        setPreview(body);
      } catch {
        // 网络瞬断:保留上次预览,不打断输入
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, split]);

  function insert(snip: string, cursor = snip.length) {
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
    <div className="flex flex-col gap-2" data-testid="markdown-editor">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Markdown 工具栏">
        {TOOLBAR.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onClick={() => insert(b.snip, b.cursor)}
            className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
        >
          媒体库…
        </button>
        <button
          type="button"
          onClick={() => setSplit((v) => !v)}
          className="ml-auto rounded bg-gray-700 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-600"
        >
          {split ? "收起预览" : "展开预览"}
        </button>
      </div>
      {uploading && <p className="text-xs text-gray-400">图片上传中…</p>}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className={split ? "grid items-start gap-3 lg:grid-cols-2" : ""}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          rows={18}
          className="w-full rounded border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-white"
          placeholder="正文 Markdown(GFM:表格/代码块/删除线均支持)…"
        />
        {split && (
          <div
            className="min-h-[240px] max-h-[520px] overflow-y-auto rounded border border-gray-700 bg-[#0d1728] p-4"
            data-testid="markdown-preview"
          >
            {preview && preview.toc.length > 0 && (
              <nav aria-label="目录预览" className="mb-3 border-b border-gray-700 pb-2 text-xs">
                <p className="mb-1 font-medium text-[#e6d8a8]">目录</p>
                <ul className="space-y-0.5">
                  {preview.toc.map((item) => (
                    <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 12 }}>
                      <span className="text-[#8fa0b8]">{item.text}</span>
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
              <p className="text-xs text-gray-500">
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
