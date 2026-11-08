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
  app: {
    /** 站点对外地址(生产/测试各自不同,后台可改) */
    url: string;
  };
  soap: {
    url: string;
    user: string;
    realm: string;
    /** 口令只写不读:只回是否已配置 */
    passwordConfigured: boolean;
  };
  gamedb: {
    /** 四个游戏库的连接串(口令已脱敏为 ***) */
    auth: string;
    characters: string;
    world: string;
    eluna: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    from: string;
    passwordConfigured: boolean;
  };
  captcha: {
    enabled: boolean;
    /** CaptchaAppId(前端用,可回显) */
    appId: string | null;
    /** 腾讯云 API 密钥 ID(签名用,可回显) */
    secretId: string | null;
    /** AppSecretKey(服务端票据校验用,只写不读) */
    appSecretConfigured: boolean;
    /** 腾讯云 API 密钥(只写不读) */
    secretKeyConfigured: boolean;
    /** 已启用但配置缺失:实际未生效,登录端点失败关闭 */
    misconfigured: boolean;
  };
  security: {
    loginMaxFails: number;
    loginWindowSec: number;
    loginLockSec: number;
    trustedProxyHops: number;
    loginIpSoftFails: number;
    loginIpMaxFails: number;
    loginIpLockSec: number;
    loginSoftLockSec: number;
    loginGlobalMaxPerMin: number;
    loginMaxConcurrent: number;
    loginQueueWaitMs: number;
    loginUnknownIpMaxPerMin: number;
    registerIpMaxPerHour: number;
    pwresetIpMaxPerHour: number;
    emailChangeIpMaxPerHour: number;
    unknownIpMaxPerHour: number;
    statusIpMaxPerMin: number;
    statusGlobalMaxPerMin: number;
    statusUnknownIpMaxPerMin: number;
    artviewIpMaxPerMin: number;
    artviewArticleMax: number;
    artviewArticleWindowSec: number;
    trackUnknownIpMaxPerMin: number;
  };
  notify: {
    pointEmailThreshold: number;
    feishuAlertEnabled: boolean;
    feishuWebhookConfigured: boolean;
    feishuWebhookSecretConfigured: boolean;
  };
  content: { tocEnabled: boolean };
  site: {
    name: string;
    tagline: string;
    icp: string;
    copyrightEn: string;
    qqGroup: string;
    qqGroupQr: string;
    qqGroupJoinUrl: string;
  };
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
  tools: {
    /** 排行榜子站地址 */
    rankBase: string;
    /** DKP 独立站地址 */
    dkpUrl: string;
  };
  cos: {
    /** 已配置(整组生效):bucket 非空 */
    configured: boolean;
    bucket: string;
    region: string;
    /** SecretId(密钥对标识,可回显以便识别用的是哪把密钥) */
    secretId: string;
    /** CDN 访问前缀 */
    cdnBase: string;
    /** SecretKey 只写不读:只回是否已配置 */
    secretKeyConfigured: boolean;
  };
  backup: {
    /** 备份保留天数(0=只留当日) */
    retentionDays: number;
    /** 游戏库周备份开关 */
    gameWeekly: boolean;
  };
};
