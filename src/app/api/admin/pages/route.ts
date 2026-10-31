import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listAdminPages, savePage } from "@/server/services/content/admin";
import { mapContentError, pageSchema } from "../_shared/content";

/** 静态页列表(FR-216) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ items: await listAdminPages() });
}

/** 静态页新建(slug 命中 RESERVED_SLUGS → 422 SLUG_RESERVED,R15) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, pageSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await savePage({
      slug: parsed.data.slug,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      status: parsed.data.status,
      sortOrder: parsed.data.sortOrder,
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapContentError(err);
  }
}
