"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownComposer } from "@/components/forum/markdown-composer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/** 发新主题表单(#34):标题 + Markdown 正文(+图片上传),成功跳主题页 */
export function ThreadComposerForm({ boardSlug }: { boardSlug: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body = await requestJson<{ threadId: string }>("/api/forum/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardSlug, title, content }),
      });
      router.push(`/forum/thread/${body.threadId}`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && content.trim().length >= 2) void submit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-body">标题(1-64 字)</span>
        <Input
          value={title}
          maxLength={64}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="一句话说清主题"
        />
      </label>
      <div className="flex flex-col gap-1 text-sm">
        <span className="text-body">正文(Markdown,支持上传图片)</span>
        <MarkdownComposer value={content} onChange={setContent} rows={12} />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !title.trim() || content.trim().length < 2}
        >
          {busy ? "发布中…" : "发布主题"}
        </Button>
        <span className="text-[11.5px] text-muted">
          发布前请阅读论坛公约;先发后审,违规内容将被版主删除
        </span>
      </div>
    </form>
  );
}
