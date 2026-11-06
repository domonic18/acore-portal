import { z } from "zod";

/** 轮播物料入参共享 schema(issue #73):新建与更新同规则 —— 标题可空=纯图,链接允许空/站内路径/http(s)。 */
export const bannerSchema = z.object({
  // 标题可空=纯图 banner(WP 原站首页顶部特色图形态,前台不渲染文字叠层)
  title: z.string().trim().max(64),
  imageUrl: z
    .string()
    .trim()
    .min(1, "图片必填")
    .max(512)
    .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "图片地址须为站内路径或 https 链接"),
  linkUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(512)
        .refine(
          (v) => v.startsWith("/") || /^https?:\/\//.test(v),
          "跳转链接须为站内路径或 http(s) 地址",
        ),
    ])
    .optional()
    .default(""),
  /**
   * 轮播视频地址(2026-11-06):非空=静音循环播放,imageUrl 作封面图。
   * optional 且**不设 default**——拖拽排序/启停开关的 payload 不带该字段,
   * 一旦有 default("") 会被 zod 填空串,把已配视频静默清空。
   * 空串=显式清空(写 null),缺省=保持现值。
   */
  videoUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(512)
        .refine(
          (v) => v.startsWith("/") || /^https:\/\//.test(v),
          "视频地址须为站内路径或 https 链接",
        ),
    ])
    .optional(),
  sort: z.number().int().min(0).max(9999).optional().default(0),
  enabled: z.boolean().optional().default(true),
});
