/**
 * 设置视图类型(api-admin-m4 契约;lib 层供 client 组件与服务层共享,
 * 照 status-types 先例——敏感字段只回掩码态布尔,类型本身零凭据)
 */
export type SettingsView = {
  smtp: {
    host: string;
    port: number;
    user: string;
    from: string;
    passwordConfigured: boolean;
  };
  turnstile: {
    enabled: boolean;
    siteKey: string | null;
    secretKeyConfigured: boolean;
  };
  security: {
    loginMaxFails: number;
    loginWindowSec: number;
    loginLockSec: number;
  };
  notify: { pointEmailThreshold: number };
  site: { icp: string; qqGroup: string };
  appearance: {
    logoUrl: string;
    faviconUrl: string;
    headerBackgroundUrl: string;
    pageBackgroundUrl: string;
  };
  download: {
    clientUrl: string;
    clientNote: string;
    launcherUrl: string;
    launcherNote: string;
    addonUrl: string;
    addonNote: string;
    yyNote: string;
  };
  umami: {
    configured: boolean;
    scriptUrl: string | null;
    websiteId: string | null;
    apiUrl: string | null;
    apiUsername: string | null;
    apiPasswordConfigured: boolean;
  };
};
