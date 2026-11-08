"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function SoapGroup({ view }: { view: SettingsView["soap"] }) {
  const [url, setUrl] = useState(view.url);
  const [user, setUser] = useState(view.user);
  const [password, setPassword] = useState("");
  const [realm, setRealm] = useState(view.realm);
  const { busy, saved, error, save } = useGroupSave();

  const [probeBusy, setProbeBusy] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);

  /** 用当前表单里的候选值测连通(不落库);口令留空=沿用现值 */
  async function testConnection() {
    setProbeBusy(true);
    setProbe(null);
    try {
      const body = await requestJson<{ ok?: boolean; message?: string }>(
        "/api/admin/settings/test/soap",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, user, password }),
        },
      );
      setProbe({ ok: !!body.ok, text: body.ok ? (body.message ?? "连通") : (body.message ?? "连接失败") });
    } catch (err) {
      setProbe({ ok: false, text: errorMessage(err) });
    } finally {
      setProbeBusy(false);
    }
  }

  return (
    <GroupSection
      name="soap"
      title="SOAP 通道"
      description="世界服命令层(发货/查询等);改完立即生效,换服无需重启;改口令留空=保持原值"
    >
      <TextRow label="SOAP 地址" testid="settings-field-soap-url" value={url} onChange={setUrl} />
      <TextRow label="账号" testid="settings-field-soap-user" value={user} onChange={setUser} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">口令</span>
        <SecretInput
          testid="settings-field-soap-password"
          configured={view.passwordConfigured}
          value={password}
          onChange={setPassword}
        />
      </label>
      <TextRow label="realm" testid="settings-field-soap-realm" value={realm} onChange={setRealm} />
      <div className="flex items-center gap-3">
        <Button
          data-testid="settings-test-soap-run"
          type="button"
          variant="secondary"
          disabled={probeBusy || url === "" || user === ""}
          onClick={() => {
            void testConnection();
          }}
        >
          {probeBusy ? "测试中…" : "测试连接"}
        </Button>
        {probe ? (
          <span
            data-testid="settings-test-soap-result"
            className={`text-sm ${probe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {probe.text}
          </span>
        ) : null}
      </div>
      <SaveBar
        group="soap"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("soap", { url, user, password, realm })) setPassword("");
        }}
      />
    </GroupSection>
  );
}
