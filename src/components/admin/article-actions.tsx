"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 文章行内删除(硬删,级联标签关联;契约 article_delete 审计在服务端) */
export function ArticleDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`确认删除文章「${title}」?该操作不可恢复。`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      className="text-red-400 hover:text-red-300 disabled:opacity-50"
    >
      删除
    </button>
  );
}
