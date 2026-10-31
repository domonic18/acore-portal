import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiModerator } from "@/server/session-guard";
import { ForumModerateError, closeThread } from "@/server/services/forum/moderate";

const schema = z.object({ closed: z.boolean() });

/** 版主关闭/重开(契约:closed=true ⇒ closedAt=now+statusLabel=closed;false ⇒ 双清) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiModerator(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
  }
  try {
    const thread = await closeThread(BigInt(id), parsed.data.closed, {
      id: BigInt(guard.session.userId),
    });
    return apiOk({ closed: thread.closedAt != null, statusLabel: thread.statusLabel });
  } catch (err) {
    if (err instanceof ForumModerateError && err.code === "THREAD_NOT_FOUND") {
      return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
    }
    throw err;
  }
}
