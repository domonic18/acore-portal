"use client";

import { useState } from "react";
import { errorMessage, requestJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { SettingsView } from "@/lib/settings-types";
import { GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

/**
 * 腾讯云 COS(对象存储/图片托管):bucket 为开关——填桶名即启用,留空=未配置。
 * SecretKey 只写不读(留空=保持现值);测试连接走未保存的候选值,不落库即可验证。
 */
export function CosGroup({ view }: { view: SettingsView["cos"] }) {
  const [bucket, setBucket] = useState(view.bucket);
  const [region, setRegion] = useState(view.region);
  const [secretId, setSecretId] = useState(view.secretId);
  const [secretKey, setSecretKey] = useState("");
  const [cdnBase, setCdnBase] = useState(view.cdnBase);
  const { busy, saved, error, save } = useGroupSave();

  const [probeBusy, setProbeBusy] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; text: string } | null>(null);

  /** 用当前表单里的候选值测桶连通(不落库);密钥留空=沿用现值 */
  async function testConnection() {
    setProbeBusy(true);
    setProbe(null);
    try {
      const body = await requestJson<{ ok?: boolean; message?: string }>(
        "/api/admin/settings/test/cos",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ bucket, region, secretId, secretKey }),
        },
      );
      setProbe({ ok: !!body.ok, text: body.message ?? (body.ok ? "连通" : "连接失败") });
    } catch (err) {
      setProbe({ ok: false, text: errorMessage(err) });
    } finally {
      setProbeBusy(false);
    }
  }

  return (
    <GroupSection
      name="cos"
      title="对象存储 COS"
      description="图片托管与备份归档;桶名留空=未配置(整组不生效);改密钥留空=保持原值"
    >
      <TextRow label="桶名" testid="settings-field-cos-bucket" value={bucket} onChange={setBucket} />
      <TextRow label="地域" testid="settings-field-cos-region" value={region} onChange={setRegion} />
      <TextRow label="SecretId" testid="settings-field-cos-secretId" value={secretId} onChange={setSecretId} />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">SecretKey</span>
        <SecretInput
          testid="settings-field-cos-secretKey"
          configured={view.secretKeyConfigured}
          value={secretKey}
          onChange={setSecretKey}
        />
      </label>
      <TextRow label="CDN 前缀" testid="settings-field-cos-cdnBase" value={cdnBase} onChange={setCdnBase} />
      <div className="flex items-center gap-3">
        <Button
          data-testid="settings-test-cos-run"
          type="button"
          variant="secondary"
          disabled={probeBusy || bucket === "" || region === "" || secretId === ""}
          onClick={() => {
            void testConnection();
          }}
        >
          {probeBusy ? "测试中…" : "测试连接"}
        </Button>
        {probe ? (
          <span
            data-testid="settings-test-cos-result"
            className={`text-sm ${probe.ok ? "text-[#6ee7b7]" : "text-[#eda9a9]"}`}
          >
            {probe.text}
          </span>
        ) : null}
      </div>
      <SaveBar
        group="cos"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          if (await save("cos", { bucket, region, secretId, secretKey, cdnBase })) setSecretKey("");
        }}
      />
    </GroupSection>
  );
}
