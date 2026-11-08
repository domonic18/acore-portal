import "server-only";
import { getConfig } from "@/lib/config";
import { maskConnectionUrl } from "@/lib/format";
import type { SettingsView } from "@/lib/settings-types";
import { THEME_IDS, isThemeId, DEFAULT_THEME } from "@/constants/theme";

/**
 * 设置视图(T030;api-admin-m4 契约):按组返回,敏感字段只回掩码态
 * (passwordConfigured 布尔 / 连接串脱敏串),任何明文凭据不出本模块。
 */
export type { SettingsView };

export async function getSettingsView(): Promise<SettingsView> {
  const config = await getConfig();
  return {
    app: {
      url: config.app.url,
    },
    soap: {
      url: config.soap.url,
      user: config.soap.user,
      realm: config.soap.realm,
      passwordConfigured: config.soap.password !== "",
    },
    gamedb: {
      // 连接串含口令:回显脱敏形态(host/库名可见,口令 ***)
      auth: maskConnectionUrl(config.gamedb.auth),
      characters: maskConnectionUrl(config.gamedb.characters),
      world: maskConnectionUrl(config.gamedb.world),
      eluna: maskConnectionUrl(config.gamedb.eluna),
    },
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.user,
      from: config.smtp.from,
      passwordConfigured: config.smtp.password !== "",
    },
    captcha: {
      enabled: config.captcha.enabled,
      appId: config.captcha.appId || null,
      secretId: config.captcha.secretId || null,
      appSecretConfigured: config.captcha.appSecret !== "",
      secretKeyConfigured: config.captcha.secretKey !== "",
      misconfigured: config.captcha.misconfigured,
    },
    security: {
      loginMaxFails: config.security.loginMaxFails,
      loginWindowSec: config.security.loginWindowSec,
      loginLockSec: config.security.loginLockSec,
      trustedProxyHops: config.security.trustedProxyHops,
      loginIpSoftFails: config.security.loginIpSoftFails,
      loginIpMaxFails: config.security.loginIpMaxFails,
      loginIpLockSec: config.security.loginIpLockSec,
      loginSoftLockSec: config.security.loginSoftLockSec,
      loginGlobalMaxPerMin: config.security.loginGlobalMaxPerMin,
      loginMaxConcurrent: config.security.loginMaxConcurrent,
      loginQueueWaitMs: config.security.loginQueueWaitMs,
      loginUnknownIpMaxPerMin: config.security.loginUnknownIpMaxPerMin,
      registerIpMaxPerHour: config.security.registerIpMaxPerHour,
      pwresetIpMaxPerHour: config.security.pwresetIpMaxPerHour,
      emailChangeIpMaxPerHour: config.security.emailChangeIpMaxPerHour,
      unknownIpMaxPerHour: config.security.unknownIpMaxPerHour,
      statusIpMaxPerMin: config.security.statusIpMaxPerMin,
      statusGlobalMaxPerMin: config.security.statusGlobalMaxPerMin,
      statusUnknownIpMaxPerMin: config.security.statusUnknownIpMaxPerMin,
      artviewIpMaxPerMin: config.security.artviewIpMaxPerMin,
      artviewArticleMax: config.security.artviewArticleMax,
      artviewArticleWindowSec: config.security.artviewArticleWindowSec,
      trackUnknownIpMaxPerMin: config.security.trackUnknownIpMaxPerMin,
    },
    notify: {
      pointEmailThreshold: config.notify.pointEmailThreshold,
      feishuAlertEnabled: config.notify.feishuAlertEnabled,
      feishuWebhookConfigured: config.notify.feishuWebhookUrl !== "",
      feishuWebhookSecretConfigured: config.notify.feishuWebhookSecret !== "",
    },
    content: { tocEnabled: config.content.tocEnabled },
    site: {
      name: config.site.name,
      tagline: config.site.tagline,
      icp: config.site.icp,
      copyrightEn: config.site.copyrightEn,
      qqGroup: config.site.qqGroup,
      qqGroupQr: config.site.qqGroupQr,
      qqGroupJoinUrl: config.site.qqGroupJoinUrl,
    },
    appearance: {
      logoUrl: config.appearance.logoUrl,
      faviconUrl: config.appearance.faviconUrl,
      headerBackgroundUrl: config.appearance.headerBackgroundUrl,
      pageBackgroundUrl: config.appearance.pageBackgroundUrl,
    },
    theme: {
      active: isThemeId(config.theme.active) ? config.theme.active : DEFAULT_THEME,
      assets: Object.fromEntries(
        THEME_IDS.map((id) => [
          id,
          {
            headerBackgroundUrl: config.theme[`${id}.headerBackgroundUrl`],
            pageBackgroundUrl: config.theme[`${id}.pageBackgroundUrl`],
            panelBackgroundUrl: config.theme[`${id}.panelBackgroundUrl`],
          },
        ]),
      ) as SettingsView["theme"]["assets"],
    },
    tools: {
      rankBase: config.tools.rankBase,
      dkpUrl: config.tools.dkpUrl,
    },
    cos: {
      configured: config.cos !== undefined,
      bucket: config.cos?.bucket ?? "",
      region: config.cos?.region ?? "",
      secretId: config.cos?.secretId ?? "",
      cdnBase: config.cos?.cdnBase ?? "",
      secretKeyConfigured: (config.cos?.secretKey ?? "") !== "",
    },
    backup: {
      retentionDays: config.backup?.retentionDays ?? 30,
      gameWeekly: config.backup?.gameWeekly ?? true,
    },
  };
}
