import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { MediaError, deleteMediaAsset } from "@/server/services/media/library";

/** 媒体删除(FR-217):删行+COS 对象;不追踪引用,warning 提示正文死链风险(前端二次确认) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "媒体资产不存在。");
  }
  try {
    await deleteMediaAsset(BigInt(id), BigInt(guard.session.userId));
    return apiOk({
      ok: true,
      warning: "已删除。若正文曾引用该文件,相应位置的图片将变成死链。",
    });
  } catch (err) {
    if (err instanceof MediaError) {
      return apiError(err.code === "NOT_FOUND" ? 404 : err.code === "COS_UNAVAILABLE" ? 503 : 422, err.code, err.message);
    }
    throw err;
  }
}
