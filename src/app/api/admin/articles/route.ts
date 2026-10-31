import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listAdminArticles, saveArticle } from "@/server/services/content/admin";
import { articleSchema, mapContentError } from "../_shared/content";

/** 文章列表(FR-215):含 draft,q=标题模糊,分页 20/页 */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const sp = new URL(req.url).searchParams;
  const page = Number(sp.get("page") ?? "1");
  const statusParam = sp.get("status");
  const result = await listAdminArticles({
    page: Number.isInteger(page) && page > 0 ? page : 1,
    q: sp.get("q") ?? undefined,
    status:
      statusParam === "draft" || statusParam === "published" ? statusParam : undefined,
  });
  return apiOk(result);
}

/** 文章新建(slug 缺省自动生成;发布即写 publishedAt,契约 api-admin-m3) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, articleSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveArticle({
      title: parsed.data.title,
      slug: parsed.data.slug,
      categoryId: BigInt(parsed.data.categoryId),
      bodyMd: parsed.data.bodyMd,
      excerpt: parsed.data.excerpt ?? null,
      status: parsed.data.status,
      tagIds: parsed.data.tagIds?.map((n) => BigInt(n)),
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapContentError(err);
  }
}
