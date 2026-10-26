import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { deleteProgressionNode, saveProgressionNode } from "@/server/services/progression/progression";
import { mapContentError, progressionSchema } from "../../_shared/content";

function parseId(raw: string): bigint | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? BigInt(id) : null;
}

/** 渐进节点更新(契约 api-admin-m3;全字段替换) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "渐进节点不存在。");
  const parsed = await parseBody(req, progressionSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await saveProgressionNode({
      id,
      title: parsed.data.title,
      phaseDate: parsed.data.phaseDate ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      bodyMd: parsed.data.bodyMd ?? null,
      status: parsed.data.status,
      icon: parsed.data.icon ?? null,
      sort: parsed.data.sort,
      actorUserId: BigInt(guard.session.userId),
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapContentError(err);
  }
}

/** 渐进节点删除(删当前指针节点同清指针行,审计 pointerCleared) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = parseId(params.id);
  if (!id) return apiError(404, "NOT_FOUND", "渐进节点不存在。");
  try {
    await deleteProgressionNode(id, BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return mapContentError(err);
  }
}
