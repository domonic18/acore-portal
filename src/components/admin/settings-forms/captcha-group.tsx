"use client";

import { useState } from "react";
import type { SettingsView } from "@/lib/settings-types";
import { CheckRow, GroupSection, SaveBar, SecretInput, TextRow, useGroupSave } from "./common";

/**
 * 腾讯云验证码(TCaptcha)设置组(2026-11-07 替换 Turnstile):
 * - appId=CaptchaAppId、appSecret=AppSecretKey:验证码控制台「验证管理」→基础配置
 * - secretId/secretKey:腾讯云 API 密钥(访问管理),仅用于服务端票据校验的云API 3.0 签名
 * 四个值全部只写不读之外的 appId/secretId 可回显,便于核对填的是哪个应用。
 */
export function CaptchaGroup({ view }: { view: SettingsView["captcha"] }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [appId, setAppId] = useState(view.appId ?? "");
  const [secretId, setSecretId] = useState(view.secretId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const { busy, saved, error, save } = useGroupSave();

  return (
    <GroupSection
      name="captcha"
      title="人机验证(腾讯云验证码)"
      description="登录/注册人机校验;启用必须带齐 appId/appSecret/secretId/secretKey 四项"
    >
      <CheckRow
        label="启用"
        hint="关闭=直通;appId/secretId 可回显,appSecret/secretKey 只写不读"
        testid="settings-field-captcha-enabled"
        checked={enabled}
        onChange={setEnabled}
      />
      {view.misconfigured && (
        <p
          role="alert"
          data-testid="settings-warn-captcha-misconfigured"
          className="rounded border border-[#5a2b2b] bg-[#2a1414] px-3 py-2 text-sm text-[#eda9a9]"
        >
          人机验证已启用但配置缺失,当前实际未生效(登录端点已失败关闭)。
        </p>
      )}
      <TextRow
        label="CaptchaAppId"
        testid="settings-field-captcha-appId"
        value={appId}
        onChange={setAppId}
      />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">AppSecretKey</span>
        <SecretInput
          testid="settings-field-captcha-appSecret"
          configured={view.appSecretConfigured}
          value={appSecret}
          onChange={setAppSecret}
        />
      </label>
      <TextRow
        label="SecretId"
        testid="settings-field-captcha-secretId"
        value={secretId}
        onChange={setSecretId}
      />
      <label className="flex flex-col gap-1 text-sm md:flex-row md:items-center md:gap-3">
        <span className="w-56 shrink-0 text-[#93b2ce]">SecretKey</span>
        <SecretInput
          testid="settings-field-captcha-secretKey"
          configured={view.secretKeyConfigured}
          value={secretKey}
          onChange={setSecretKey}
        />
      </label>
      <SaveBar
        group="captcha"
        busy={busy}
        saved={saved}
        error={error}
        onSave={async () => {
          const ok = await save("captcha", {
            enabled,
            appId,
            appSecret,
            secretId,
            secretKey,
          });
          if (ok) {
            setAppSecret("");
            setSecretKey("");
          }
        }}
      />
    </GroupSection>
  );
}
