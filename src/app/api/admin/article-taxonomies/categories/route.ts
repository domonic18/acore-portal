import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  listAdminArticleCategories,
  saveArticleCategory,
} from "@/server/services/content/admin";
import { categorySchema, mapContentError } from "../../_shared/content";

/** 文章分类列表(含引用计数,删除前置校验展示用) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ items: await listAdminArticleCategories() });
}

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, categorySchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveArticleCategory({
      name: parsed.data.name,
      slug: parsed.data.slug,
      sort: parsed.data.sort,
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapContentError(err);
  }
}
