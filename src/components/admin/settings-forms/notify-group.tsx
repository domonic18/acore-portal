"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function NotifyGroup({ view }: { view: SettingsView["notify"] }) {
  const [threshold, setThreshold] = useState(String(view.pointEmailThreshold));
  const [feishuEnabled, setFeishuEnabled] = useState(view.feishuAlertEnabled);
  const [feishuUrl, setFeishuUrl] = useState("");
  const [feishuSecret, setFeishuSecret] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="notify"
      title="通知"
      description="积分变动邮件阈值与飞书运营告警通道"
    >
      <TextRow
        label="积分变动邮件阈值(0=关闭)"
        testid="settings-field-notify-pointEmailThreshold"
        value={threshold}
        onChange={setThreshold}
      />
      <CheckRow
        label="启用飞书发货告警"
        hint="订单发货失败时推卡片到飞书群"
        testid="settings-field-notify-feishuAlertEnabled"
        checked={feishuEnabled}
        onChange={setFeishuEnabled}
      />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">飞书 Webhook 地址</span>
        <SecretInput
          testid="settings-field-notify-feishuWebhookUrl"
          configured={view.feishuWebhookConfigured}
          value={feishuUrl}
          onChange={setFeishuUrl}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">飞书签名密钥</span>
        <SecretInput
          testid="settings-field-notify-feishuWebhookSecret"
          configured={view.feishuWebhookSecretConfigured}
          value={feishuSecret}
          onChange={setFeishuSecret}
        />
      </label>
      <SaveBar
        group="notify"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          const ok = await save("notify", {
            pointEmailThreshold: threshold,
            feishuAlertEnabled: feishuEnabled,
            feishuWebhookUrl: feishuUrl,
            feishuWebhookSecret: feishuSecret,
          });
          if (ok) {
            setFeishuUrl("");
            setFeishuSecret("");
          }
        }}
      />
    </GroupSection>
  );
}
