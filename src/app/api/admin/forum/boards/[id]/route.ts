import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { ForumAdminError, deleteBoard, updateBoard } from "@/server/services/forum/admin";

const updateSchema = z.object({
  slug: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(255).optional().nullable(),
  sort: z.number().int().min(0).max(9999).optional(),
});

function toBoardError(err: unknown) {
  if (err instanceof ForumAdminError) {
    if (err.code === "BOARD_NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
    if (err.code === "BOARD_SLUG_DUPLICATE") return apiError(409, "BOARD_SLUG_DUPLICATE", err.message);
    if (err.code === "BOARD_HAS_THREADS") return apiError(422, "BOARD_HAS_THREADS", err.message);
    return apiError(422, "SLUG_INVALID", err.message);
  }
  return null;
}

/** 编辑版块(slug 可改,审计记 old/new) */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, updateSchema);
  if (!parsed.ok) return parsed.response;
  const boardId = Number(params.id);
  if (!Number.isInteger(boardId) || boardId <= 0) {
    return apiError(404, "NOT_FOUND", "版块不存在。");
  }
  try {
    await updateBoard({ id: BigInt(boardId), ...parsed.data, actorId: BigInt(guard.session.userId) });
    return apiOk({});
  } catch (err) {
    const mapped = toBoardError(err);
    if (mapped) return mapped;
    throw err;
  }
}

/** 删除版块(版块下仍有主题即拒绝) */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const boardId = Number(params.id);
  if (!Number.isInteger(boardId) || boardId <= 0) {
    return apiError(404, "NOT_FOUND", "版块不存在。");
  }
  try {
    await deleteBoard({ id: BigInt(boardId), actorId: BigInt(guard.session.userId) });
    return apiOk({});
  } catch (err) {
    const mapped = toBoardError(err);
    if (mapped) return mapped;
    throw err;
  }
}
