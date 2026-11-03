"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 邀请码批量生成 + 行内启停(api-admin;M1 表与状态机复用,注册侧消费仍后置)。
 */
export function InvitationGenerateForm() {
  const router = useRouter();
  const [prefix, setPrefix] = useState("LK");
  const [length, setLength] = useState("12");
  const [count, setCount] = useState("10");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setCodes(null);
    try {
      const body = await requestJson<{ codes: string[] }>("/api/admin/invitation-codes/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prefix,
          length: Number(length) || 12,
          count: Number(count) || 1,
          maxUses: Number(maxUses) || 1,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      setCodes(body.codes);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">前缀(大写字母/数字)</span>
          <Input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">总长度</span>
          <Input
            type="number"
            min={6}
            max={32}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className="w-20"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">数量(1-200)</span>
          <Input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">每码可用次数</span>
          <Input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">过期时间(留空=永久)</span>
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <Button
          type="button"
          variant="primary"
          onClick={submit}
          disabled={busy || !prefix}
        >
          {busy ? "生成中…" : "批量生成"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[#eda9a9]">
          {error}
        </p>
      )}
      {codes && (
        <div className="rounded-lg border border-[#22385a] bg-[#0b1526] p-3">
          <p className="mb-1 text-xs text-[#6482a3]">本次生成 {codes.length} 枚:</p>
          <p className="break-all font-mono text-xs text-[#6ee7b7]">{codes.join("  ")}</p>
        </div>
      )}
    </div>
  );
}

export function InvitationStatusToggle({
  codeId,
  status,
}: {
  codeId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await requestJson(`/api/admin/invitation-codes/${codeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: status === "disabled" ? "available" : "disabled" }),
      });
      router.refresh();
    } catch {
      // 失败静默:按钮状态不切换,刷新后以服务端状态为准
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={toggle} disabled={busy}>
      {status === "disabled" ? "启用" : "停用"}
    </Button>
  );
}
