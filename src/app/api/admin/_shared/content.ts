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
  tocEnabled: z.boolean().nullable().optional(),
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
  tocEnabled: z.boolean().nullable().optional(),
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
  icon: z.string().max(64).nullable().optional(),
  sort: z.coerce.number().int().min(0).max(9999),
});

/** 渐进画布整树保存:数组顺序即 sort;id 空=新增,currentId null=清除指针 */
export const progressionTimelineSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().regex(/^\d+$/, "节点 id 非法").nullable(),
          title: z.string().trim().min(1, "标题必填").max(128),
          phaseDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式 yyyy-MM-dd")
            .nullable(),
          imageUrl: z.string().max(500).nullable(),
          bodyMd: z.string().nullable(),
          status: z.enum(["locked", "open"]),
          icon: z.string().max(64).nullable(),
        }),
      )
      .max(200, "最多 200 个阶段"),
    deletedIds: z
      .array(z.string().regex(/^\d+$/, "删除节点 id 非法"))
      .max(200, "最多删除 200 个阶段")
      .default([]),
    currentId: z.string().regex(/^\d+$/, "当前阶段 id 非法").nullable(),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.items.forEach((item, index) => {
      if (!item.id) return;
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "id"],
          message: "节点 id 重复",
        });
      }
      seen.add(item.id);
    });
    value.deletedIds.forEach((id, index) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deletedIds", index],
          message: "节点不能同时出现在画布与删除列表",
        });
      }
    });
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
