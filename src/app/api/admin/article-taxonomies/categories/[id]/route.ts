import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  deleteArticleCategory,
  saveArticleCategory,
} from "@/server/services/content/admin";
import { categorySchema, mapContentError } from "../../../_shared/content";

/** 分类更新/删除(删除有文章引用 → 422 CATEGORY_IN_USE,契约 api-admin-m3) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "分类不存在。");
  }
  const parsed = await parseBody(req, categorySchema);
  if (!parsed.ok) return parsed.response;
  try {
    await saveArticleCategory({
      id: BigInt(id),
      name: parsed.data.name,
      slug: parsed.data.slug,
      sort: parsed.data.sort,
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapContentError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "分类不存在。");
  }
  try {
    await deleteArticleCategory(BigInt(id), BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
