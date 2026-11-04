"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api-client";

/** 文章行内删除(硬删,级联标签关联;契约 article_delete 审计在服务端) */
export function ArticleDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`确认删除文章「${title}」?该操作不可恢复。`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/admin/articles/${id}`, { method: "DELETE" });
      router.refresh();
    } catch {
      // 删除失败静默(与既有行为一致),刷新后由列表状态自证
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="danger" size="sm" onClick={remove} disabled={busy}>
      删除
    </Button>
  );
}
