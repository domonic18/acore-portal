import "server-only";
import { getConfig } from "@/lib/config";
import type { SettingsView } from "@/lib/settings-types";

/**
 * 设置视图(T030;api-admin-m4 契约):五组按组返回,敏感字段只回掩码态布尔
 * (passwordConfigured/secretKeyConfigured),任何明文凭据不出本模块。
 */
export type { SettingsView };

export async function getSettingsView(): Promise<SettingsView> {
  const config = await getConfig();
  return {
    smtp: {
      host: config.smtp.host,
      port: config.smtp.port,
      user: config.smtp.user,
      from: config.smtp.from,
      passwordConfigured: config.smtp.password !== "",
    },
    turnstile: config.turnstile
      ? {
          enabled: config.turnstile.enabled,
          siteKey: config.turnstile.siteKey || null,
          secretKeyConfigured: config.turnstile.secretKey !== "",
        }
      : { enabled: false, siteKey: null, secretKeyConfigured: false },
    security: {
      loginMaxFails: config.security.loginMaxFails,
      loginWindowSec: config.security.loginWindowSec,
      loginLockSec: config.security.loginLockSec,
    },
    notify: { pointEmailThreshold: config.notify.pointEmailThreshold },
    umami: config.umami
      ? {
          configured: true,
          scriptUrl: config.umami.scriptUrl,
          websiteId: config.umami.websiteId,
          apiUrl: config.umami.apiUrl,
          apiUsername: config.umami.apiUsername,
          apiPasswordConfigured: config.umami.apiPassword !== "",
        }
      : {
          configured: false,
          scriptUrl: null,
          websiteId: null,
          apiUrl: null,
          apiUsername: null,
          apiPasswordConfigured: false,
        },
  };
}
