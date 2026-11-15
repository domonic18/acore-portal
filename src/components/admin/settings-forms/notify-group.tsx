"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

export function NotifyGroup({ view }: { view: SettingsView["notify"] }) {
  const [threshold, setThreshold] = useState(String(view.pointEmailThreshold));
  const [feishuEnabled, setFeishuEnabled] = useState(view.feishuAlertEnabled);
  const [feishuUrl, setFeishuUrl] = useState("");
  const [feishuSecret, setFeishuSecret] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  const [probeBusy, setProbeBusy] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);

  /** 测试告警通道(用未保存的候选值,不落库):真发一张测试卡片 */
  async function testChannel() {
    setProbeBusy(true);
    setProbe(null);
    try {
      const body = await requestJson<{ ok?: boolean; message?: string }>(
        "/api/admin/settings/test/notify",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ webhookUrl: feishuUrl, webhookSecret: feishuSecret }),
        },
      );
      setProbe({ ok: !!body.ok, text: body.message ?? (body.ok ? "发送成功" : "发送失败") });
    } catch (err) {
      setProbe({ ok: false, text: errorMessage(err) });
    } finally {
      setProbeBusy(false);
    }
  }

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
        label="启用飞书告警通道"
        hint="发货失败、备份失败与心跳缺失都走这一个通道"
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
      <div className="flex items-center gap-3">
        <Button
          data-testid="settings-test-notify-run"
          type="button"
          variant="secondary"
          disabled={probeBusy || (feishuUrl === "" && !view.feishuWebhookConfigured)}
          onClick={() => {
            void testChannel();
          }}
        >
          {probeBusy ? "测试中…" : "测试通道"}
        </Button>
        {probe ? (
          <span
            data-testid="settings-test-notify-result"
            className={`text-sm ${probe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {probe.text}
          </span>
        ) : null}
        {!feishuEnabled ? (
          <span className="text-sm text-[#93b2ce]">告警开关当前关闭,通道仍可测试</span>
        ) : null}
      </div>
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
