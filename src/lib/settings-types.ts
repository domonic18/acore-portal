import type { ThemeId } from "@/constants/theme";

/**
 * 设置视图类型(api-admin-m4 契约;lib 层供 client 组件与服务层共享,
 * 照 status-types 先例——敏感字段只回掩码态布尔,类型本身零凭据)
 */

/** 主题背景资源槽位:页头/页面/面板,留空=回落 appearance 组或纯色底 */
export type ThemeAssets = {
  headerBackgroundUrl: string;
  pageBackgroundUrl: string;
  panelBackgroundUrl: string;
};

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
  content: { tocEnabled: boolean };
  site: { icp: string; copyrightEn: string; qqGroup: string; qqGroupQr: string; qqGroupJoinUrl: string };
  appearance: {
    logoUrl: string;
    faviconUrl: string;
    headerBackgroundUrl: string;
    pageBackgroundUrl: string;
  };
  theme: {
    active: ThemeId;
    assets: Record<ThemeId, ThemeAssets>;
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
