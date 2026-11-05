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
  sort: z.number().int().min(0).max(9999).optional().default(0),
  enabled: z.boolean().optional().default(true),
});
