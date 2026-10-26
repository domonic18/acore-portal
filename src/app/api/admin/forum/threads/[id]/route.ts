import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  ForumModerateError,
  closeThread,
  deleteThread,
  labelThread,
  pinThread,
  undeleteThread,
} from "@/server/services/forum/moderate";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pin"), pinned: z.boolean() }),
  z.object({ action: z.literal("close"), closed: z.boolean() }),
  z.object({ action: z.literal("label"), label: z.enum(["none", "standard", "resolved"]) }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("undelete") }),
]);

/**
 * 后台主题操作(admin 专属,/api/forum/moderate/* 是 moderator 面):
 * action 分发到 moderate.ts 服务函数(审计在服务层统一落)。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const threadId = Number(params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return apiError(404, "NOT_FOUND", "主题不存在。");
  }
  const actor = { id: BigInt(guard.session.userId) };
  try {
    switch (parsed.data.action) {
      case "pin":
        await pinThread(BigInt(threadId), parsed.data.pinned, actor);
        break;
      case "close":
        await closeThread(BigInt(threadId), parsed.data.closed, actor);
        break;
      case "label":
        await labelThread(BigInt(threadId), parsed.data.label, actor);
        break;
      case "delete":
        await deleteThread(BigInt(threadId), actor);
        break;
      case "undelete":
        await undeleteThread(BigInt(threadId), actor);
        break;
    }
  } catch (err) {
    if (err instanceof ForumModerateError) {
      if (err.code === "THREAD_NOT_FOUND") {
        return apiError(404, "NOT_FOUND", "主题不存在(或不在该操作允许的状态)。");
      }
      return apiError(422, "LABEL_INVALID", "状态标签不合法。");
    }
    throw err;
  }
  return apiOk({});
}
