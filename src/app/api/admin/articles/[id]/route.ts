import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  deleteArticle,
  getAdminArticle,
  saveArticle,
} from "@/server/services/content/admin";
import { articleSchema, mapContentError } from "../../_shared/content";

function parseId(raw: string): bigint | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? BigInt(id) : null;
}

/** 文章详情(编辑回填)/更新/硬删(契约:硬删级联 article_tag,审计脱敏只记 id/slug) */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "文章不存在。");
  const article = await getAdminArticle(id);
  if (!article) return apiError(404, "NOT_FOUND", "文章不存在。");
  return apiOk(article);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "文章不存在。");
  const parsed = await parseBody(req, articleSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await saveArticle({
      id,
      title: parsed.data.title,
      slug: parsed.data.slug,
      categoryId: BigInt(parsed.data.categoryId),
      bodyMd: parsed.data.bodyMd,
      excerpt: parsed.data.excerpt ?? null,
      status: parsed.data.status,
      tagIds: parsed.data.tagIds?.map((n) => BigInt(n)),
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapContentError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "文章不存在。");
  try {
    await deleteArticle(id, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
