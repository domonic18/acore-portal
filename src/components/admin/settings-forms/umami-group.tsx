"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function UmamiGroup({ view }: { view: SettingsView["umami"] }) {
  const [scriptUrl, setScriptUrl] = useState(view.scriptUrl ?? "");
  const [websiteId, setWebsiteId] = useState(view.websiteId ?? "");
  const [apiUrl, setApiUrl] = useState(view.apiUrl ?? "");
  const [apiUsername, setApiUsername] = useState(view.apiUsername ?? "");
  const [apiPassword, setApiPassword] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="umami"
      title="Umami 统计"
      description="流量统计采集与看板区块;scriptUrl 为浏览器侧地址,apiUrl 为服务端侧地址"
    >
      <TextRow label="采集脚本地址" testid="settings-field-umami-scriptUrl" value={scriptUrl} onChange={setScriptUrl} />
      <TextRow label="Website ID" testid="settings-field-umami-websiteId" value={websiteId} onChange={setWebsiteId} />
      <TextRow label="API 地址" testid="settings-field-umami-apiUrl" value={apiUrl} onChange={setApiUrl} />
      <TextRow label="API 用户名" testid="settings-field-umami-apiUsername" value={apiUsername} onChange={setApiUsername} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-gray-300">API 密码</span>
        <SecretInput
          testid="settings-field-umami-apiPassword"
          configured={view.apiPasswordConfigured}
          value={apiPassword}
          onChange={setApiPassword}
        />
      </label>
      <SaveBar
        group="umami"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("umami", { scriptUrl, websiteId, apiUrl, apiUsername, apiPassword }))
            setApiPassword("");
        }}
      />
    </GroupSection>
  );
}
