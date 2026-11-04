"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/api-client";

/** 静态页行内删除 */
export function PageDeleteButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`确认删除静态页「${title}」?前台 /{"{slug}"} 将立即 404。`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/admin/pages/${id}`, { method: "DELETE" });
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
