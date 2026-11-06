import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";
import { STATUS_CONFIG_KEYS } from "@/constants/status";
import { DEFAULT_THEME, THEME_IDS, isThemeId } from "@/constants/theme";

/**
 * 系统配置唯一入口:SMTP/SOAP/游戏库连接串/站点地址等业务通道配置存 system_config 表,
 * env 仅存业务库/Redis 连接串与会话签名密钥(宪法 v1.0.2)。
 * 启动时经 instrumentation 预热 fail-fast;运行期读进程内缓存,
 * 管理端变更配置后调 reloadSystemConfig 写穿失效。凭据值禁止打印/落日志。
 */

/** 外观资源地址:站内路径或 http(s);禁空白/引号/括号/反斜杠,保证内联样式插值安全 */
const assetUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) => (v === "" || v.startsWith("/") || /^https?:\/\//.test(v)) && !/[\s"'()\\]/.test(v),
    "须为站内路径或 http(s) 地址",
  );

/** 页脚英文版权声明默认值(WP 原版 lokta.cn 页脚逐字迁移,两行以 \n 分隔) */
export const DEFAULT_SITE_COPYRIGHT_EN = [
  "World of Warcraft® and Blizzard Entertainment® are all trademarks or registered trademarks of Blizzard Entertainment in the United States and/or other countries.",
  "These terms and all related materials, logos, and images are copyright © Blizzard Entertainment. This site is in no way associated with or endorsed by Blizzard Entertainment®.",
].join("\n");

const configSchema = z.object({
  app: z.object({
    url: z.string().url(),
  }),
  soap: z.object({
    url: z.string().url(),
    user: z.string().min(1),
    password: z.string().min(1),
    realm: z.string().default("Dev"),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive(),
    user: z.string().default(""),
    password: z.string().default(""),
    from: z.string().email(),
  }),
  // 游戏四库连接串(auth 库账号须具备 account 表写权限,根本防线 research R5);
  // 进程内惰性建连,改库连接需重启生效
  gamedb: z.object({
    auth: z.string().url(),
    characters: z.string().url(),
    world: z.string().url(),
    eluna: z.string().url(),
  }),
  // COS 对象存储(M2 US6 图片迁移;未配置=功能未启用,不阻塞启动,US6 首用时报错)
  cos: z
    .object({
      bucket: z.string().min(1),
      region: z.string().min(1),
      secretId: z.string().min(1),
      secretKey: z.string().min(1),
      cdnBase: z.string().url(),
    })
    .optional(),
  // 服务器状态人工项(M3 US6;p15 字段二分):键缺省按 enabled=true/maintenance=false
  status: z.object({
    enabled: z.boolean(),
    maintenanceMode: z.boolean(),
  }),
  // 腾讯云验证码人机校验(2026-11-07 替换 Turnstile):组恒存在(键缺省=关闭直通);
  // enabled=true 但四件套缺失 → 不抛错(整站不再 500),置 misconfigured:
  // 是否真正生效由校验层判定(登录端点失败关闭),后台设置页出红色告警
  // appId=CaptchaAppId / appSecret=AppSecretKey(验证码控制台「验证管理」→基础配置);
  // secretId/secretKey=腾讯云 API 密钥(访问管理),仅用于 DescribeCaptchaResult 的云API 3.0 签名
  captcha: z.object({
    enabled: z.boolean().default(false),
    appId: z.string().default(""),
    appSecret: z.string().default(""),
    secretId: z.string().default(""),
    secretKey: z.string().default(""),
    misconfigured: z.boolean().default(false),
  }),
  // 登录防滥用参数(M4 US2):连续失败阈值/计数窗口/锁定时长
  // trustedProxyHops:应用正前方的可信代理跳数(2026-11-06 撞库加固 PR-A),
  // 客户端 IP 按 XFF 右起 N 跳解析——代理链不足或头缺失 → 落「未知 IP」桶
  // IP 维(2026-11-06 撞库加固 PR-C):软阈只降速+审计,硬阈只锁攻击源 IP(不锁账号)
  // 哈希背压:并发闸限单进程在飞哈希数,全局预算限每分钟真实哈希次数
  security: z.object({
    loginMaxFails: z.coerce.number().int().positive().default(5),
    loginWindowSec: z.coerce.number().int().positive().default(900),
    loginLockSec: z.coerce.number().int().positive().default(900),
    trustedProxyHops: z.coerce.number().int().min(0).max(8).default(1),
    loginIpSoftFails: z.coerce.number().int().positive().default(20),
    loginIpMaxFails: z.coerce.number().int().positive().default(50),
    loginIpLockSec: z.coerce.number().int().positive().default(900),
    loginSoftLockSec: z.coerce.number().int().positive().default(2),
    loginGlobalMaxPerMin: z.coerce.number().int().positive().default(60),
    loginMaxConcurrent: z.coerce.number().int().positive().max(32).default(4),
    loginQueueWaitMs: z.coerce.number().int().positive().max(10000).default(1500),
    loginUnknownIpMaxPerMin: z.coerce.number().int().positive().default(600),
    // 未鉴权端点按 IP 限速(注册/找回/换邮箱确认),窗口 1 小时
    registerIpMaxPerHour: z.coerce.number().int().positive().default(10),
    pwresetIpMaxPerHour: z.coerce.number().int().positive().default(20),
    emailChangeIpMaxPerHour: z.coerce.number().int().positive().default(20),
    // 「未知 IP」共享兜底桶上限(次/小时):IP 不可判定时所有请求并成一个桶,
    // 阈值必须远宽于按 IP 阈值,否则代理配置错一次就误伤全站
    unknownIpMaxPerHour: z.coerce.number().int().positive().default(6000),
    // 状态页限速(公开无鉴权端点,探针会打 SOAP worldserver + characters 库)
    statusIpMaxPerMin: z.coerce.number().int().positive().default(30),
    statusGlobalMaxPerMin: z.coerce.number().int().positive().default(120),
    statusUnknownIpMaxPerMin: z.coerce.number().int().positive().default(600),
    // 阅读计数限速(公开无鉴权端点,每次上报都写一次 DB):
    // 每 IP 总闸(次/分)防单 IP 对海量文章刷写;每 (IP,文章) 窗口闸防刷阅读量
    artviewIpMaxPerMin: z.coerce.number().int().positive().default(60),
    artviewArticleMax: z.coerce.number().int().positive().default(1),
    artviewArticleWindowSec: z.coerce.number().int().positive().default(600),
  }),
  // 通知域(M4 US3):积分变动邮件阈值(0=关闭)
  notify: z.object({
    pointEmailThreshold: z.coerce.number().int().min(0).default(0),
  }),
  // 内容域(2026-11-05 用户反馈):正文目录开关;键缺省按 tocEnabled=true
  content: z.object({
    tocEnabled: z.boolean().default(true),
  }),
  // 站点标识(CRUD 对齐审计):icp 空=页脚不渲染备案链接,
  // copyrightEn 空=页脚不渲染英文版权声明(WP 原版商标免责声明逐字迁移);
  // qqGroup 空=侧栏不渲染 QQ 交流群卡,qqGroupQr 空=卡内不渲染二维码
  // (默认=public/qq-group-qr.png,WP 原版页脚素材 qrcode_for_qq.png 迁移)
  site: z.object({
    icp: z.string().default("京ICP备2022035466号"),
    copyrightEn: z.string().default(DEFAULT_SITE_COPYRIGHT_EN),
    qqGroup: z.string().default("184670219"),
    qqGroupQr: z.string().default("/qq-group-qr.png"),
    // 加群链接(issue #95):默认=WP 原站 qm.qq.com 短链;空=群号回落点击复制
    qqGroupJoinUrl: z
      .string()
      .refine((v) => v === "" || /^https?:\/\//.test(v), "加群链接须为 http(s) 地址")
      .default("https://qm.qq.com/q/hz9TWpqU2A"),
  }),
  // 站点外观(2026-10 用户反馈):favicon / 页头 logo / 页头背景 / 页面背景均可后台配置;
  // logo 与 favicon 空=回落内置资源,背景空=不渲染背景图(纯色底)
  appearance: z.object({
    logoUrl: assetUrlSchema.default("/logo.png"),
    faviconUrl: assetUrlSchema.default("/favicon-32.png"),
    headerBackgroundUrl: assetUrlSchema.default("/background.jpg"),
    pageBackgroundUrl: assetUrlSchema.default("/background.jpg"),
  }),
  // 站点主题(2026-11-06 主题系统):active=当前主题 id(色板见 styles/globals.css,
  // id 登记见 constants/theme.ts);每套主题可各自覆盖页头/页面/面板背景图,
  // 留空=回落 appearance 组的通用背景配置(面板无对应项,留空=纯色底)
  theme: z.object({
    active: z.enum(THEME_IDS).default(DEFAULT_THEME),
    "tbc.headerBackgroundUrl": assetUrlSchema.default(""),
    "tbc.pageBackgroundUrl": assetUrlSchema.default(""),
    "tbc.panelBackgroundUrl": assetUrlSchema.default(""),
    "wlk.headerBackgroundUrl": assetUrlSchema.default("/images/banner-wotlk.svg"),
    "wlk.pageBackgroundUrl": assetUrlSchema.default("/background.jpg"),
    "wlk.panelBackgroundUrl": assetUrlSchema.default(""),
  }),
  // 首页配置(US 首页配置):最近成就 iframe 嵌入三参数;url 空=整块隐藏,
  // 高度为 CSS 长度(185vh/600px 等),scrolling 控制 iframe 滚动条;
  // 轮播间隔秒数(1-60,默认 5)供 HomeCarousel 自动轮播
  home: z.object({
    achievementUrl: z.string().default(""),
    achievementHeight: z.string().default("185vh"),
    achievementScrolling: z.boolean().default(false),
    carouselIntervalSec: z.coerce.number().int().min(1).max(60).default(5),
  }),
  // 外部工具站地址(M4 US1):rank 排行榜子站与 DKP 独立站,换环境只改 system_config
  tools: z.object({
    rankBase: z.string().url().default("https://rank.lokta.cn"),
    dkpUrl: z.string().url().default("https://webdkp.nfuwow.com"),
  }),
  // 备份(M4 US5):脚本运行参数,不影响 web 启动
  backup: z
    .object({
      retentionDays: z.coerce.number().int().min(0).default(30),
      gameWeekly: z.boolean().default(true),
    })
    .optional(),
});

export type SystemConfig = z.infer<typeof configSchema>;

let cache: SystemConfig | null = null;

function flattenToSchema(rows: { key: string; value: string }[]) {
  const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    app: { url: flat["app.url"] },
    soap: {
      url: flat["soap.url"],
      user: flat["soap.user"],
      password: flat["soap.password"],
      realm: flat["soap.realm"],
    },
    smtp: {
      host: flat["smtp.host"],
      port: flat["smtp.port"],
      user: flat["smtp.user"] ?? "",
      password: flat["smtp.password"] ?? "",
      from: flat["smtp.from"],
    },
    gamedb: {
      auth: flat["gamedb.auth"],
      characters: flat["gamedb.characters"],
      world: flat["gamedb.world"],
      eluna: flat["gamedb.eluna"],
    },
    cos: flat["cos.bucket"]
      ? {
          bucket: flat["cos.bucket"],
          region: flat["cos.region"],
          secretId: flat["cos.secretId"],
          secretKey: flat["cos.secretKey"],
          cdnBase: flat["cos.cdnBase"],
        }
      : undefined,
    status: {
      enabled: flat[STATUS_CONFIG_KEYS.enabled] !== "false",
      maintenanceMode: flat[STATUS_CONFIG_KEYS.maintenanceMode] === "true",
    },
    captcha: (() => {
      const enabled = flat["captcha.enabled"] === "true";
      const appId = flat["captcha.appId"] ?? "";
      const appSecret = flat["captcha.appSecret"] ?? "";
      const secretId = flat["captcha.secretId"] ?? "";
      const secretKey = flat["captcha.secretKey"] ?? "";
      // 启用但配置缺失:不抛错(整站不 500),标 misconfigured;
      // 实际生效与否由校验层判定,后台设置页出红色告警
      return {
        enabled,
        appId,
        appSecret,
        secretId,
        secretKey,
        misconfigured: enabled && (!appId || !appSecret || !secretId || !secretKey),
      };
    })(),
    security: {
      loginMaxFails: flat["security.loginMaxFails"] ?? "5",
      loginWindowSec: flat["security.loginWindowSec"] ?? "900",
      loginLockSec: flat["security.loginLockSec"] ?? "900",
      trustedProxyHops: flat["security.trustedProxyHops"] ?? "1",
      loginIpSoftFails: flat["security.loginIpSoftFails"] ?? "20",
      loginIpMaxFails: flat["security.loginIpMaxFails"] ?? "50",
      loginIpLockSec: flat["security.loginIpLockSec"] ?? "900",
      loginSoftLockSec: flat["security.loginSoftLockSec"] ?? "2",
      loginGlobalMaxPerMin: flat["security.loginGlobalMaxPerMin"] ?? "60",
      loginMaxConcurrent: flat["security.loginMaxConcurrent"] ?? "4",
      loginQueueWaitMs: flat["security.loginQueueWaitMs"] ?? "1500",
      loginUnknownIpMaxPerMin: flat["security.loginUnknownIpMaxPerMin"] ?? "600",
      registerIpMaxPerHour: flat["security.registerIpMaxPerHour"] ?? "10",
      pwresetIpMaxPerHour: flat["security.pwresetIpMaxPerHour"] ?? "20",
      emailChangeIpMaxPerHour: flat["security.emailChangeIpMaxPerHour"] ?? "20",
      unknownIpMaxPerHour: flat["security.unknownIpMaxPerHour"] ?? "6000",
      statusIpMaxPerMin: flat["security.statusIpMaxPerMin"] ?? "30",
      statusGlobalMaxPerMin: flat["security.statusGlobalMaxPerMin"] ?? "120",
      statusUnknownIpMaxPerMin: flat["security.statusUnknownIpMaxPerMin"] ?? "600",
      artviewIpMaxPerMin: flat["security.artviewIpMaxPerMin"] ?? "60",
      artviewArticleMax: flat["security.artviewArticleMax"] ?? "1",
      artviewArticleWindowSec: flat["security.artviewArticleWindowSec"] ?? "600",
    },
    notify: {
      pointEmailThreshold: flat["notify.pointEmailThreshold"] ?? "0",
    },
    content: {
      tocEnabled: flat["content.tocEnabled"] !== "false",
    },
    site: {
      icp: flat["site.icp"] ?? "京ICP备2022035466号",
      copyrightEn: flat["site.copyrightEn"] ?? DEFAULT_SITE_COPYRIGHT_EN,
      qqGroup: flat["site.qqGroup"] ?? "184670219",
      qqGroupQr: flat["site.qqGroupQr"] ?? "/qq-group-qr.png",
      qqGroupJoinUrl: flat["site.qqGroupJoinUrl"] ?? "https://qm.qq.com/q/hz9TWpqU2A",
    },
    appearance: {
      logoUrl: flat["appearance.logoUrl"] ?? "/logo.png",
      faviconUrl: flat["appearance.faviconUrl"] ?? "/favicon-32.png",
      headerBackgroundUrl: flat["appearance.headerBackgroundUrl"] ?? "/background.jpg",
      pageBackgroundUrl: flat["appearance.pageBackgroundUrl"] ?? "/background.jpg",
    },
    theme: {
      // 非法 id 回落默认主题:单行脏数据不应让整站配置校验失败(500)
      active: isThemeId(flat["theme.active"] ?? "") ? flat["theme.active"]! : DEFAULT_THEME,
      "tbc.headerBackgroundUrl": flat["theme.tbc.headerBackgroundUrl"] ?? "",
      "tbc.pageBackgroundUrl": flat["theme.tbc.pageBackgroundUrl"] ?? "",
      "tbc.panelBackgroundUrl": flat["theme.tbc.panelBackgroundUrl"] ?? "",
      "wlk.headerBackgroundUrl":
        flat["theme.wlk.headerBackgroundUrl"] ?? "/images/banner-wotlk.svg",
      "wlk.pageBackgroundUrl": flat["theme.wlk.pageBackgroundUrl"] ?? "/background.jpg",
      "wlk.panelBackgroundUrl": flat["theme.wlk.panelBackgroundUrl"] ?? "",
    },
    home: {
      achievementUrl: flat["home.achievementUrl"] ?? "",
      achievementHeight: flat["home.achievementHeight"] ?? "185vh",
      achievementScrolling: flat["home.achievementScrolling"] === "true",
      carouselIntervalSec: flat["home.carouselIntervalSec"] ?? "5",
    },
    tools: {
      rankBase: flat["tools.rankBase"] ?? "https://rank.lokta.cn",
      dkpUrl: flat["tools.dkpUrl"] ?? "https://webdkp.nfuwow.com",
    },
    backup:
      (flat["backup.retentionDays"] ?? flat["backup.gameWeekly"])
        ? {
            retentionDays: flat["backup.retentionDays"] ?? "30",
            gameWeekly: flat["backup.gameWeekly"] !== "false",
          }
        : undefined,
  };
}

function parseConfig(raw: ReturnType<typeof flattenToSchema>): SystemConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    // 只报缺失/格式,不回显任何值
    throw new Error(`system_config 配置校验失败(检查 system_config 表): ${issues}`);
  }
  return parsed.data;
}

export async function loadSystemConfig(): Promise<SystemConfig> {
  const rows = await prisma.systemConfig.findMany({
    select: { key: true, value: true },
  });
  return buildConfigFromRows(rows);
}

/** 纯函数(KV 行→校验后配置),供单测与设置保存路径复用 */
export function buildConfigFromRows(rows: { key: string; value: string }[]): SystemConfig {
  return parseConfig(flattenToSchema(rows));
}

/** 读配置(首次调用查库并缓存;之后读缓存) */
export async function getConfig(): Promise<SystemConfig> {
  if (!cache) {
    cache = await loadSystemConfig();
  }
  return cache;
}

export async function reloadSystemConfig(): Promise<SystemConfig> {
  cache = await loadSystemConfig();
  return cache;
}

/** 图片域白名单(renderMarkdown cdnHosts):cos.cdnBase 主机名;未配置=仅站内相对路径放行 */
export async function getCdnHosts(): Promise<string[]> {
  const cos = (await getConfig()).cos;
  return cos ? [new URL(cos.cdnBase).hostname] : [];
}
