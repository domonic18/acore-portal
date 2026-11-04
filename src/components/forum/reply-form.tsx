"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarkdownComposer } from "@/components/forum/markdown-composer";
import { Button } from "@/components/ui/button";
import { errorMessage, requestJson } from "@/lib/api-client";

/** 主题页回帖表单(#34):登录用户可见;成功后刷新定位到最后一页 */
export function ReplyForm({
  threadId,
  lastPageHref,
}: {
  threadId: string;
  lastPageHref: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [okFloor, setOkFloor] = useState<number | null>(null);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const body = await requestJson<{ floor: number }>(
        `/api/forum/threads/${threadId}/posts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      setContent("");
      setOkFloor(body.floor);
      // 回帖常落在最后一页:跳末页让用户立刻看到自己的楼层
      router.push(lastPageHref);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-[#22385a] px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (content.trim().length >= 2) void submit();
      }}
    >
      <h2 className="text-[14px] font-semibold text-[#dcebf7]">发表回复</h2>
      <MarkdownComposer value={content} onChange={setContent} placeholder="支持 Markdown 语法,文明发言…" rows={6} />
      {error && (
        <p role="alert" className="text-xs text-[#eda9a9]">
          {error}
        </p>
      )}
      {okFloor !== null && !error && (
        <p role="status" className="text-xs text-[#6ee7b7]">
          回帖成功,已发布到第 {okFloor} 楼。
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={busy || content.trim().length < 2}
        >
          {busy ? "发布中…" : "回复"}
        </Button>
        <span className="text-[11.5px] text-[#6482a3]">
          发表前请阅读
          <Link href="/convention" className="mx-1 text-[#6fb7e0] hover:underline">
            论坛公约
          </Link>
          ,违规内容将被删除
        </span>
      </div>
    </form>
  );
}
