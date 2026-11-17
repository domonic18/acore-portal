import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { getCurrentGroupValues } from "@/server/services/settings/current";
import { sensitiveMode } from "@/server/services/settings/schemas";
import { resolveSubmittedValue } from "@/server/services/settings/values";
import {
  probeLlmChat,
  probeLlmEmbedding,
} from "@/server/services/assistant/llm-probe";

const schema = z.object({
  target: z.enum(["chat", "embedding"]),
  provider: z.enum(["openai", "anthropic"]),
  baseUrl: z.string().default(""),
  apiKey: z.string().default(""),
  model: z.string().default(""),
  embeddingBaseUrl: z.string().default(""),
  embeddingModel: z.string().default(""),
  embeddingApiKey: z.string().default(""),
});

/**
 * 测试 AI 通道连通(用未保存的候选值):对话/向量两路各自可测。
 * 失败是业务结果回显 200 { ok:false, message },不 5xx。
 * 密钥只写不读:表单回传空串=沿用现值(服务端回填后再探)。
 * 审计只记通道名与成败,地址/密钥/模型不落。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const current = await getCurrentGroupValues("llm");
  const result =
    parsed.data.target === "chat"
      ? await probeLlmChat({
          provider: parsed.data.provider,
          baseUrl: parsed.data.baseUrl,
          apiKey: resolveSubmittedValue(
            current["llm.apiKey"],
            parsed.data.apiKey,
            sensitiveMode("llm", "apiKey"),
          ),
          model: parsed.data.model,
        })
      : await probeLlmEmbedding({
          baseUrl: parsed.data.embeddingBaseUrl,
          apiKey: resolveSubmittedValue(
            current["llm.embeddingApiKey"],
            parsed.data.embeddingApiKey,
            sensitiveMode("llm", "embeddingApiKey"),
          ),
          model: parsed.data.embeddingModel,
        });

  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SETTINGS_TEST_CONNECTION,
    actorUserId: BigInt(guard.session.userId),
    payload: { channel: `llm-${parsed.data.target}`, ok: result.ok },
  });
  return apiOk(result);
}
