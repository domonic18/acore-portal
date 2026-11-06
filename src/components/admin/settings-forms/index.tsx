"use client";

import type { SettingsView } from "@/lib/settings-types";
import { AppearanceGroup } from "./appearance-group";
import { ContentGroup } from "./content-group";
import { NotifyGroup } from "./notify-group";
import { SecurityGroup } from "./security-group";
import { SiteGroup } from "./site-group";
import { SmtpGroup } from "./smtp-group";
import { TestMailCard } from "./test-mail-card";
import { ThemeGroup } from "./theme-group";
import { TurnstileGroup } from "./turnstile-group";
import { UmamiGroup } from "./umami-group";

/**
 * 八组设置表单+测试发信卡片(T032;api-admin-m4 契约)。
 * 敏感字段(smtp.password/turnstile.secretKey/umami.apiPassword)只写不读:
 * 已配置显「已配置,留空保持」占位,空提交=保持原值,非空=覆写。
 */
export function SettingsForms({ view }: { view: SettingsView }) {
  return (
    <div className="flex flex-col gap-4">
      <SmtpGroup view={view.smtp} />
      <TurnstileGroup view={view.turnstile} />
      <SecurityGroup view={view.security} />
      <NotifyGroup view={view.notify} />
      <ContentGroup view={view.content} />
      <SiteGroup view={view.site} />
      <AppearanceGroup view={view.appearance} />
      <ThemeGroup view={view.theme} />
      <UmamiGroup view={view.umami} />
      <TestMailCard />
    </div>
  );
}
