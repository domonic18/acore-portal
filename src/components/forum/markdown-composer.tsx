"use client";

import dynamic from "next/dynamic";
import { useHydrated } from "@/lib/use-hydrated";

const MAX_CONTENT = 20_000;

const VditorEditor = dynamic(() => import("./vditor-editor").then((m) => m.VditorEditor), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center rounded-lg border border-line bg-panel-inset text-xs text-muted">
      编辑器加载中…
    </div>
  ),
});

/**
 * 论坛发帖/回帖共用正文编辑器(#34):Vditor IR 即时渲染(Typora 式编辑即所见)
 * + 工具栏(加粗/列表/表格/受限色板/图片上传)。props 契约与旧 textarea 版一致,
 * 消费方(thread-composer-form / reply-form)零改动。
 * 水合前/JS 失败时回落受控 textarea;编辑器 chunk 仅发帖/回帖页加载。
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
  const hydrated = useHydrated();

  return (
    <div data-testid="forum-composer">
      {hydrated ? (
        <VditorEditor
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={rows}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_CONTENT))}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-lg border border-line bg-panel-inset p-3 font-mono text-sm leading-6 text-heading placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-link/60"
        />
      )}
    </div>
  );
}
