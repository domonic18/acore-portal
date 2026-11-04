import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiModerator } from "@/server/session-guard";
import { ForumModerateError, deletePost } from "@/server/services/forum/moderate";

const schema = z.object({ threadId: z.coerce.number().int().positive() });

/** 版主删楼层(软删;主贴拒绝并引导删主题) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiModerator(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const postId = Number(params.id);
  if (!Number.isInteger(postId) || postId <= 0) {
    return apiError(404, "THREAD_NOT_FOUND", "楼层不存在。");
  }
  try {
    await deletePost({
      threadId: BigInt(parsed.data.threadId),
      postId: BigInt(postId),
      actor: { id: BigInt(guard.session.userId) },
    });
    return apiOk({});
  } catch (err) {
    if (err instanceof ForumModerateError) {
      if (err.code === "THREAD_NOT_FOUND") return apiError(404, "THREAD_NOT_FOUND", "楼层不存在。");
      if (err.code === "INVALID_FLOOR") return apiError(422, "INVALID_FLOOR", err.message);
    }
    throw err;
  }
}
