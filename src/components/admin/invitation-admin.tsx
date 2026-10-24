"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const res = await fetch("/api/admin/invitation-codes/generate", {
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
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error?.message ?? "生成失败,请稍后重试。");
        return;
      }
      setCodes(body.codes);
      router.refresh();
    } catch {
      setError("网络异常,请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">前缀(大写字母/数字)</span>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toUpperCase())}
            className={`${inputCls} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">总长度</span>
          <input
            type="number"
            min={6}
            max={32}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            className={`${inputCls} w-20`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">数量(1-200)</span>
          <input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">每码可用次数</span>
          <input
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            className={`${inputCls} w-24`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">过期时间(留空=永久)</span>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className={inputCls}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !prefix}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "生成中…" : "批量生成"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {codes && (
        <div className="rounded border border-gray-700 bg-gray-900 p-3">
          <p className="mb-1 text-xs text-gray-500">本次生成 {codes.length} 枚:</p>
          <p className="break-all font-mono text-xs text-green-400">{codes.join("  ")}</p>
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
      await fetch(`/api/admin/invitation-codes/${codeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: status === "disabled" ? "available" : "disabled" }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
    >
      {status === "disabled" ? "启用" : "停用"}
    </button>
  );
}
