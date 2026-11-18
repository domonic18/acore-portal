import type { NextRequest } from "next/server";

import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { readAssistantThreadMessages } from "@/server/services/assistant/checkpointer/thread-log";

/** 后台「AI 对话」详情:thread 消息时间线(checkpoint 反序列化,只读) */
export async function GET(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const threadId = params.threadId;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(threadId)) {
    return apiError(422, "VALIDATION_FAILED", "threadId 格式不合法");
  }
  return apiOk({ messages: await readAssistantThreadMessages(threadId) });
}
