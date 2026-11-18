import type { NextRequest } from "next/server";
import { z } from "zod";

import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { apiError, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getAssistantAgent } from "@/server/services/assistant/agent";
import { checkSiteTokenQuota } from "@/server/services/assistant/quota";
import { createAssistantRunStream } from "@/server/services/assistant/run";
import { recordAssistantSession } from "@/server/services/assistant/session-log";
import { recordAssistantUsage } from "@/server/services/assistant/usage";
import { writeAudit } from "@/server/services/shared/audit";
import { resolveChatBinding } from "@/server/services/shared/ai-models/resolver";

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

  // 一次解析 chat 绑定:生效模型 + 站点日 Token 上限(同一行,不分两次查)
  const { model, dailyTokenMax } = await resolveChatBinding();
  const siteQuota = await checkSiteTokenQuota(dailyTokenMax);
  if (!siteQuota.allowed) {
    return apiError(429, "QUOTA_EXCEEDED", "今日站点问答额度已用完,明天再来吧", {
      retryAfterSec: siteQuota.retryAfterSec,
    });
  }
  const agent = getAssistantAgent(model);
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
    // 会话台账(后台「AI 对话」页列表;标题只落首问截断,正文仍在 checkpoint)
    await recordAssistantSession({
      threadId,
      userId: BigInt(session.userId),
      promptTokens: stats.promptTokens,
      completionTokens: stats.completionTokens,
      question: parsed.data.messages?.[0]?.content ?? null,
    }).catch(() => undefined);
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
