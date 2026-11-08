"use client";

import type { SettingsView } from "@/lib/settings-types";
import { AppGroup } from "./app-group";
import { AppearanceGroup } from "./appearance-group";
import { BackupGroup } from "./backup-group";
import { CaptchaGroup } from "./captcha-group";
import { ContentGroup } from "./content-group";
import { CosGroup } from "./cos-group";
import { GameDbGroup } from "./gamedb-group";
import { NotifyGroup } from "./notify-group";
import { SecurityGroup } from "./security-group";
import { SiteGroup } from "./site-group";
import { SmtpGroup } from "./smtp-group";
import { SoapGroup } from "./soap-group";
import { TestMailCard } from "./test-mail-card";
import { ThemeGroup } from "./theme-group";
import { ToolsGroup } from "./tools-group";

/**
 * 十四组设置表单+测试发信卡片(T032;api-admin-m4 契约)。
 * 敏感字段按组+字段定口径:只写不读者(smtp/captcha/soap/cos 密钥)已配置显
 * 「已配置,留空保持」,空提交=保持原值;连接串(game库)回显脱敏串,
 * 提交值等于脱敏形态或口令位仍是 *** 时按未改处理。
 */
export function SettingsForms({ view }: { view: SettingsView }) {
  return (
    <div className="flex flex-col gap-4">
      <AppGroup view={view.app} />
      <SoapGroup view={view.soap} />
      <GameDbGroup view={view.gamedb} />
      <CosGroup view={view.cos} />
      <SmtpGroup view={view.smtp} />
      <CaptchaGroup view={view.captcha} />
      <SecurityGroup view={view.security} />
      <NotifyGroup view={view.notify} />
      <ContentGroup view={view.content} />
      <SiteGroup view={view.site} />
      <AppearanceGroup view={view.appearance} />
      <ThemeGroup view={view.theme} />
      <ToolsGroup view={view.tools} />
      <BackupGroup view={view.backup} />
      <TestMailCard />
    </div>
  );
}
