import type { NextRequest } from "next/server";
import { z } from "zod";

import { AI_MODEL_ROLES, AI_PROTOCOLS } from "@/constants/ai-models";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { probeAiModelCandidate } from "@/server/services/shared/ai-models/probe";

/** 候选值探针 schema:候选值只在本次请求内使用,绝不落库 */
const schema = z.object({
  protocol: z.enum(AI_PROTOCOLS),
  role: z.enum(AI_MODEL_ROLES),
  baseUrl: z.string().trim().max(500).optional().nullable(),
  apiKey: z.string().trim().max(500).optional().nullable(),
  modelId: z.string().trim().min(1).max(100),
});

/** 测试连接(表单内候选值,不落库):保存前验证「地址+密钥+模型」真的通 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const result = await probeAiModelCandidate({
    protocol: parsed.data.protocol,
    role: parsed.data.role,
    baseUrl: parsed.data.baseUrl || null,
    apiKey: parsed.data.apiKey || null,
    modelId: parsed.data.modelId,
  });
  return apiOk({ result });
}
