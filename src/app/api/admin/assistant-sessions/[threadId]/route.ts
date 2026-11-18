import type { NextRequest } from "next/server";

import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { readAssistantThreadMessages } from "@/server/services/assistant/checkpointer/thread-log";
import { deleteAssistantThread } from "@/server/services/assistant/session-cleanup";
import { writeAudit } from "@/server/services/shared/audit";

const THREAD_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** 后台「AI 对话」详情:thread 消息时间线(checkpoint 反序列化,只读) */
export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const threadId = params.threadId;
  if (!THREAD_ID_PATTERN.test(threadId)) {
    return apiError(422, "VALIDATION_FAILED", "threadId 格式不合法");
  }
  return apiOk({ messages: await readAssistantThreadMessages(threadId) });
}

/**
 * 后台删除助手会话:连同检查点、中间写、台账行一并删除(会话生命周期原语)。
 * 审计只记 threadId 与删除行数,对话正文不入审计。
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const threadId = params.threadId;
  if (!THREAD_ID_PATTERN.test(threadId)) {
    return apiError(422, "VALIDATION_FAILED", "threadId 格式不合法");
  }
  const result = await deleteAssistantThread(threadId);
  if (result.writes + result.checkpoints + result.sessions === 0) {
    return apiError(404, "NOT_FOUND", "会话不存在");
  }
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.ASSISTANT_SESSION_DELETED,
    actorUserId: BigInt(guard.session.userId),
    payload: {
      threadId,
      writes: result.writes,
      checkpoints: result.checkpoints,
      sessions: result.sessions,
    },
  });
  return apiOk({ ok: true });
}
