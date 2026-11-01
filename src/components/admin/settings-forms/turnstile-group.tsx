"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function TurnstileGroup({ view }: { view: SettingsView["turnstile"] }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [siteKey, setSiteKey] = useState(view.siteKey ?? "");
  const [secretKey, setSecretKey] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="turnstile"
      title="Turnstile 人机验证"
      description="登录/注册人机校验;启用必须带双密钥,公网前请换真实密钥"
    >
      <CheckRow
        label="启用"
        hint="关闭=直通;siteKey 为公钥可回显,secretKey 只写不读"
        testid="settings-field-turnstile-enabled"
        checked={enabled}
        onChange={setEnabled}
      />
      <TextRow label="Site Key" testid="settings-field-turnstile-siteKey" value={siteKey} onChange={setSiteKey} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-gray-300">Secret Key</span>
        <SecretInput
          testid="settings-field-turnstile-secretKey"
          configured={view.secretKeyConfigured}
          value={secretKey}
          onChange={setSecretKey}
        />
      </label>
      <SaveBar
        group="turnstile"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("turnstile", { enabled, siteKey, secretKey })) setSecretKey("");
        }}
      />
    </GroupSection>
  );
}
