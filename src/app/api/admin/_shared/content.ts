import { z } from "zod";
import { apiError } from "@/server/http";
import { ContentAdminError } from "@/server/services/content/admin";

/** 内容后台入参 Zod 与错误映射(路由私有共享;Next 路由文件仅可导出 HTTP 方法) */

export const articleSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  title: z.string().min(1).max(255),
  slug: z.string().max(191).regex(/^[a-z0-9-]*$/, "别名仅允许小写字母/数字/连字符").optional(),
  categoryId: z.coerce.number().int().positive(),
  bodyMd: z.string().min(1),
  excerpt: z.string().max(500).nullable().optional(),
  status: z.enum(["draft", "published"]),
  tagIds: z.array(z.coerce.number().int().positive()).max(20).optional(),
});

export const pageSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "别名仅允许小写字母/数字/连字符"),
  title: z.string().min(1).max(255),
  bodyMd: z.string().min(1),
  status: z.enum(["draft", "published"]),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export const categorySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  sort: z.coerce.number().int().min(0).max(9999),
});

export const tagSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
});

/** 渐进节点(T048 契约补全;phaseDate yyyy-MM-dd,null=未定档) */
export const progressionSchema = z.object({
  title: z.string().min(1).max(128),
  phaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式 yyyy-MM-dd")
    .nullable()
    .optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  bodyMd: z.string().nullable().optional(),
  status: z.enum(["locked", "open"]),
  sort: z.coerce.number().int().min(0).max(9999),
});

/** 内容域错误码 → HTTP(api-admin-m3 契约:422=冲突/校验,404=不存在) */
export function mapContentError(err: unknown) {
  if (err instanceof ContentAdminError) {
    return apiError(
      err.code === "NOT_FOUND" || err.code === "CATEGORY_NOT_FOUND" ? 404 : 422,
      err.code,
      err.message,
    );
  }
  throw err;
}
