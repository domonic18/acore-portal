import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiModerator } from "@/server/session-guard";
import { ForumModerateError, deleteThread } from "@/server/services/forum/moderate";

/** 版主软删(thread+楼层同事务 deletedAt,数据保留;审计含 title 快照) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiModerator(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
  }
  try {
    await deleteThread(BigInt(id), { id: BigInt(guard.session.userId) });
    return apiOk({ deleted: true });
  } catch (err) {
    if (err instanceof ForumModerateError && err.code === "THREAD_NOT_FOUND") {
      return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
    }
    throw err;
  }
}
