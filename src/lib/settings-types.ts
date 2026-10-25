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
  umami: {
    configured: boolean;
    scriptUrl: string | null;
    websiteId: string | null;
    apiUrl: string | null;
    apiUsername: string | null;
    apiPasswordConfigured: boolean;
  };
};
