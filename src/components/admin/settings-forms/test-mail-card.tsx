"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
      className="flex flex-col gap-3 rounded-xl border border-[#22385a] bg-[#13233a] p-4"
    >
      <div>
        <h2 className="font-semibold text-[#dcebf7]">测试发信</h2>
        <p className="text-xs text-[#6482a3]">
          用当前 SMTP 配置直发一封测试邮件(不入发信队列),保存后即时生效
        </p>
      </div>
      <TextRow label="收件地址" testid="settings-testmail-to" value={to} onChange={setTo} />
      <div className="flex items-center gap-3">
        <Button
          data-testid="settings-testmail-run"
          type="button"
          variant="primary"
          disabled={busy || to === ""}
          onClick={send}
        >
          {busy ? "发送中…" : "发送测试邮件"}
        </Button>
        {result ? (
          <span
            data-testid="settings-testmail-result"
            className={`text-sm ${result.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {result.text}
          </span>
        ) : null}
      </div>
    </section>
  );
}
