import type { NextRequest } from "next/server";
import { z } from "zod";

import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { getConfig } from "@/lib/config";
import { apiError, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getAssistantAgent } from "@/server/services/assistant/agent";
import { consumeAssistantQuota } from "@/server/services/assistant/quota";
import { createAssistantRunStream } from "@/server/services/assistant/run";
import { recordAssistantUsage } from "@/server/services/assistant/usage";
import { writeAudit } from "@/server/services/shared/audit";

const schema = z
  .object({
    messages: z
      .array(z.object({ content: z.string().trim().min(1).max(4000) }))
      .min(1)
      .max(4)
      .optional(),
    resume: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((v) => v.messages !== undefined || v.resume !== undefined, {
    message: "messages 与 resume 至少一项",
  });

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

/**
 * 助手问答 SSE(M9 W6):POST 一轮提问/续跑,流式回 LangGraph 兼容帧。
 * 未登录 401(游客关);配额超 429;通道未配 503(前端据此显示降级提示)。
 * 审计只落聚合指标(userId/threadId/成败/耗时/token),对话正文不入审计。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录后使用助手");
  const threadId = params.threadId;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(threadId)) {
    return apiError(422, "VALIDATION_FAILED", "threadId 格式不合法");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const { llm } = await getConfig();
  const quota = await consumeAssistantQuota(session.userId, llm.dailyQuota);
  if (!quota.allowed) {
    return apiError(429, "QUOTA_EXCEEDED", "今日问答次数已用完,明天再来吧", {
      retryAfterSec: quota.retryAfterSec,
    });
  }
  const agent = await getAssistantAgent();
  if (!agent) return apiError(503, "ASSISTANT_UNAVAILABLE", "助手暂不可用,请稍后再试");

  const { stream, done } = createAssistantRunStream(agent, {
    threadId,
    messages: parsed.data.messages?.map((m) => m.content),
    resume: parsed.data.resume,
  });

  void done.then(async ({ stats, durationMs }) => {
    await writeAudit({
      category: AUDIT_CATEGORY.ASSISTANT,
      action: AUDIT_ACTION.ASSISTANT_RUN,
      actorUserId: BigInt(session.userId),
      payload: {
        threadId,
        ok: stats.ok,
        durationMs,
        promptTokens: stats.promptTokens,
        completionTokens: stats.completionTokens,
      },
    });
    // 看板「AI 助手」面板的日聚合(只落聚合指标与脱敏问题词,正文不入库)
    await recordAssistantUsage({
      ok: stats.ok,
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      question: parsed.data.messages?.[0]?.content ?? null,
    }).catch(() => undefined);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
