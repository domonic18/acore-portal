import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { BannerAdminError, deleteBanner, updateBanner } from "@/server/services/home/banners";
import { bannerSchema } from "../../_shared/banners";

/** 编辑轮播物料(全量提交) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, bannerSchema);
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
