import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listAdminTags, saveTag } from "@/server/services/content/admin";
import { mapContentError, tagSchema } from "../../_shared/content";

/** 标签列表(含引用计数) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ items: await listAdminTags() });
}

/** 标签新建(同名/同 slug → 422 DUPLICATE,契约 api-admin-m3) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, tagSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveTag({ name: parsed.data.name, slug: parsed.data.slug });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapContentError(err);
  }
}
