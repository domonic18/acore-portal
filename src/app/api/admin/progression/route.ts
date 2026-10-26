import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listAdminProgression, saveProgressionNode } from "@/server/services/progression/progression";
import { mapContentError, progressionSchema } from "../_shared/content";

/** 渐进计划全量列表(T048 契约补全;含 isCurrent 指针标记) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ items: await listAdminProgression() });
}

/** 渐进节点新建(契约 api-admin-m3:body { title, phaseDate?, imageUrl?, bodyMd?, status, sort }) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, progressionSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveProgressionNode({
      title: parsed.data.title,
      phaseDate: parsed.data.phaseDate ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      bodyMd: parsed.data.bodyMd ?? null,
      status: parsed.data.status,
      icon: parsed.data.icon ?? null,
      sort: parsed.data.sort,
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapContentError(err);
  }
}
