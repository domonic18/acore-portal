import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { BannerAdminError, deleteBanner, updateBanner } from "@/server/services/home/banners";

const updateSchema = z.object({
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

/** 编辑轮播物料(全量提交) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, updateSchema);
  if (!parsed.ok) return parsed.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "轮播物料不存在。");
  }
  try {
    await updateBanner(BigInt(id), parsed.data, BigInt(guard.session.userId));
    return apiOk({});
  } catch (err) {
    if (err instanceof BannerAdminError && err.code === "NOT_FOUND") {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}

/** 删除轮播物料(无外键依赖,直接删) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "轮播物料不存在。");
  }
  try {
    await deleteBanner(BigInt(id), BigInt(guard.session.userId));
    return apiOk({});
  } catch (err) {
    if (err instanceof BannerAdminError && err.code === "NOT_FOUND") {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}
