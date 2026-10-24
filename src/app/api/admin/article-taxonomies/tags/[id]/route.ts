import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { deleteTag } from "@/server/services/content/admin";
import { mapContentError } from "../../../_shared/content";

/** 标签删除(级联 article_tag,不影响文章正文) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "标签不存在。");
  }
  try {
    await deleteTag(BigInt(id), BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
