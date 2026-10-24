import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { deletePage, getAdminPage, savePage } from "@/server/services/content/admin";
import { mapContentError, pageSchema } from "../../_shared/content";

function parseId(raw: string): bigint | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? BigInt(id) : null;
}

/** 静态页详情/更新/删除(更新同样校验 RESERVED_SLUGS 与唯一冲突) */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "页面不存在。");
  const page = await getAdminPage(id);
  if (!page) return apiError(404, "NOT_FOUND", "页面不存在。");
  return apiOk(page);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "页面不存在。");
  const parsed = await parseBody(req, pageSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await savePage({
      id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      status: parsed.data.status,
      sortOrder: parsed.data.sortOrder,
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
  if (!id) return apiError(404, "NOT_FOUND", "页面不存在。");
  try {
    await deletePage(id, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
