import { z } from "zod";
import { THEME_IDS } from "@/constants/theme";

/**
 * 设置分组 schema 与行键映射(T030):
 * 组级全量提交——敏感字段(password/secretKey/apiPassword)optional,
 * 空/缺省语义在 save.ts 的 keep 分支处理。
 * 每个字段对应一条 system_config 行,行键 = 组名.字段名(theme 组为二级点号)。
 */

/** 可清空的资源地址(站内路径或 http(s));禁空白/引号/括号/反斜杠,保证内联样式插值安全 */
export const dlUrlSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .refine(
      (v) =>
        (v.startsWith("/") || /^https?:\/\//.test(v)) &&
        !/[\s"'()\\]/.test(v),
      "链接须为站内路径或 http(s) 地址",
    ),
]);

export const groupSchemas = {
  smtp: z.object({
    host: z.string().min(1, "host 必填"),
    port: z.coerce.number().int().positive(),
    user: z.string().default(""),
    password: z.string().optional(),
    from: z.string().email(),
  }),
  turnstile: z.object({
    enabled: z.boolean(),
    siteKey: z.string().default(""),
    secretKey: z.string().optional(),
  }),
  security: z.object({
    loginMaxFails: z.coerce.number().int().positive(),
    loginWindowSec: z.coerce.number().int().positive(),
    loginLockSec: z.coerce.number().int().positive(),
  }),
  notify: z.object({
    pointEmailThreshold: z.coerce.number().int().min(0),
  }),
  // 内容域:目录开关;optional=缺省保持现值(组级全量提交口径)
  content: z.object({
    tocEnabled: z.boolean().optional(),
  }),
  site: z.object({
    icp: z.string().trim().max(64),
    // 可选=缺省保持现值(与 home 组口径);空串=显式清空(页脚不渲染)
    copyrightEn: z.string().trim().max(1000).optional(),
    // QQ 交流群:群号空=侧栏整卡隐藏;二维码地址空=卡内不渲染(留空隐藏语义同 icp)
    qqGroup: z
      .union([z.literal(""), z.string().trim().regex(/^\d{5,12}$/, "QQ 群号须为 5-12 位数字")]),
    qqGroupQr: dlUrlSchema,
    // 加群链接(issue #95):https 链接;空=群号回落点击复制;缺省=保持现值
    qqGroupJoinUrl: z
      .union([
        z.literal(""),
        z.string().trim().url().refine((v) => /^https?:\/\//.test(v), "加群链接须为 http(s) 地址"),
      ])
      .optional(),
  }),
  // 站点外观:logo/favicon 留空=回落内置资源,背景留空=隐藏背景图
  appearance: z.object({
    logoUrl: dlUrlSchema,
    faviconUrl: dlUrlSchema,
    headerBackgroundUrl: dlUrlSchema,
    pageBackgroundUrl: dlUrlSchema,
  }),
  // 站点主题:当前主题 id + 每套主题的页头/页面/面板背景图(留空=回落 appearance 通用背景)
  theme: z.object({
    active: z.enum(THEME_IDS).optional(),
    "tbc.headerBackgroundUrl": dlUrlSchema.optional(),
    "tbc.pageBackgroundUrl": dlUrlSchema.optional(),
    "tbc.panelBackgroundUrl": dlUrlSchema.optional(),
    "wlk.headerBackgroundUrl": dlUrlSchema.optional(),
    "wlk.pageBackgroundUrl": dlUrlSchema.optional(),
    "wlk.panelBackgroundUrl": dlUrlSchema.optional(),
  }),
  // home 组成就字段 optional:轮播设置表单单独提交(缺省字段=保持现值,见序列化 keep 分支)
  home: z.object({
    achievementUrl: z
      .union([
        z.literal(""),
        z.string().trim().url().refine((v) => /^https:\/\//.test(v), "成就页地址须为 https 链接"),
      ])
      .optional(),
    achievementHeight: z
      .string()
      .trim()
      .regex(/^\d+(px|vh|rem|%)$/, "高度格式如 185vh / 600px")
      .optional(),
    achievementScrolling: z.boolean().optional(),
    carouselIntervalSec: z.coerce
      .number()
      .int()
      .min(1, "轮播间隔须为 1-60 秒")
      .max(60, "轮播间隔须为 1-60 秒")
      .optional(),
  }),
} as const;

/** 字段 → system_config 键;sensitive 键空输入=保持原值 */
export const groupKeys: Record<keyof typeof groupSchemas, Record<string, string>> = {
  smtp: {
    host: "smtp.host",
    port: "smtp.port",
    user: "smtp.user",
    password: "smtp.password",
    from: "smtp.from",
  },
  turnstile: {
    enabled: "turnstile.enabled",
    siteKey: "turnstile.siteKey",
    secretKey: "turnstile.secretKey",
  },
  security: {
    loginMaxFails: "security.loginMaxFails",
    loginWindowSec: "security.loginWindowSec",
    loginLockSec: "security.loginLockSec",
  },
  notify: { pointEmailThreshold: "notify.pointEmailThreshold" },
  content: { tocEnabled: "content.tocEnabled" },
  site: {
    icp: "site.icp",
    copyrightEn: "site.copyrightEn",
    qqGroup: "site.qqGroup",
    qqGroupQr: "site.qqGroupQr",
    qqGroupJoinUrl: "site.qqGroupJoinUrl",
  },
  appearance: {
    logoUrl: "appearance.logoUrl",
    faviconUrl: "appearance.faviconUrl",
    headerBackgroundUrl: "appearance.headerBackgroundUrl",
    pageBackgroundUrl: "appearance.pageBackgroundUrl",
  },
  theme: {
    active: "theme.active",
    "tbc.headerBackgroundUrl": "theme.tbc.headerBackgroundUrl",
    "tbc.pageBackgroundUrl": "theme.tbc.pageBackgroundUrl",
    "tbc.panelBackgroundUrl": "theme.tbc.panelBackgroundUrl",
    "wlk.headerBackgroundUrl": "theme.wlk.headerBackgroundUrl",
    "wlk.pageBackgroundUrl": "theme.wlk.pageBackgroundUrl",
    "wlk.panelBackgroundUrl": "theme.wlk.panelBackgroundUrl",
  },
  home: {
    achievementUrl: "home.achievementUrl",
    achievementHeight: "home.achievementHeight",
    achievementScrolling: "home.achievementScrolling",
    carouselIntervalSec: "home.carouselIntervalSec",
  },
};
/** 敏感字段:空串输入=保持原值(不落库、不覆盖) */
export const sensitiveFields = new Set(["password", "secretKey", "apiPassword"]);

export function isSettingsGroup(group: string): group is keyof typeof groupSchemas {
  return group in groupSchemas;
}
