"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { TextRow } from "./common";

export function TestMailCard() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const body = await requestJson<{ ok?: boolean; error?: string }>(
        "/api/admin/settings/test-mail",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ to }),
        },
      );
      setResult(
        body.ok
          ? { ok: true, text: "测试邮件已发送,请到收件箱查收" }
          : { ok: false, text: `发送失败:${body.error ?? "未知错误"}` },
      );
    } catch (err) {
      setResult({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="settings-testmail"
      className="flex flex-col gap-3 rounded border border-gray-800 p-4"
    >
      <div>
        <h2 className="font-semibold text-gray-100">测试发信</h2>
        <p className="text-xs text-gray-500">
          用当前 SMTP 配置直发一封测试邮件(不入发信队列),保存后即时生效
        </p>
      </div>
      <TextRow label="收件地址" testid="settings-testmail-to" value={to} onChange={setTo} />
      <div className="flex items-center gap-3">
        <button
          data-testid="settings-testmail-run"
          type="button"
          disabled={busy || to === ""}
          onClick={send}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "发送中…" : "发送测试邮件"}
        </button>
        {result ? (
          <span
            data-testid="settings-testmail-result"
            className={`text-sm ${result.ok ? "text-green-400" : "text-red-400"}`}
          >
            {result.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}
