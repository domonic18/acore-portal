import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { createBanner } from "@/server/services/home/banners";

const schema = z.object({
  title: z.string().trim().min(1, "标题必填").max(64),
  imageUrl: z
    .string()
    .trim()
    .min(1, "图片必填")
    .max(512)
    .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "图片地址须为站内路径或 https 链接"),
  linkUrl: z
    .union([z.literal(""), z.string().trim().max(512).refine((v) => /^https?:\/\//.test(v), "跳转链接须为 http(s) 地址")])
    .optional()
    .default(""),
  sort: z.number().int().min(0).max(9999).optional().default(0),
  enabled: z.boolean().optional().default(true),
});

/** 新建轮播物料 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const id = await createBanner(parsed.data, BigInt(guard.session.userId));
  return apiOk({ id: id.toString() });
}
