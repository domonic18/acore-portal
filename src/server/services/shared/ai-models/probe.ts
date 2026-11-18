import "server-only";

import { prisma } from "@/lib/db";
import type { AiModelProbeResult } from "@/lib/ai-models-types";
import { AUDIT_ACTION } from "@/constants/audit";
import type { AiModelRole, AiProtocol } from "@/constants/ai-models";
import { writeAudit } from "@/server/services/shared/audit";

import { AiModelError, getAiModelStored, parseRoles } from "./crud";

/**
 * AI 模型探针(照 settings 通道探针口径):用候选值跑一次最小请求,
 * 不落库先验证(表单内「测试连接」);已存条目测试另走 testStoredAiModel 落 last_test_*。
 * 探针只发无副作用请求(1 token 补全、单条 embedding),响应体不回显,
 * 失败只给状态码与首行摘要。
 */

const PROBE_TIMEOUT_MS = 15_000;

function fail(reason: string, startedAt: number): AiModelProbeResult {
  return { ok: false, message: reason.slice(0, 200), latencyMs: Date.now() - startedAt };
}

function errorSummary(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "请求超时";
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split("\n")[0]?.slice(0, 200) || "网络错误";
}

/** 端点拼接:base_url 存裸端点(可能空 = SDK 默认官方地址),此处补齐协议路径 */
function endpoint(baseUrl: string | null, path: string): string {
  return `${(baseUrl ?? "").replace(/\/+$/, "")}${path}`;
}

/**
 * 探测参数(候选值形态):baseUrl 可空(供应商默认端点),
 * 但 embedding 探针必须有可拼的 base——openai SDK 默认指 api.openai.com,国内不可达,
 * 故 embedding 探针要求 base_url 非空,提示管理员填网关地址。
 */
export type AiModelProbeInput = {
  protocol: AiProtocol;
  role: AiModelRole;
  baseUrl: string | null;
  apiKey: string | null;
  modelId: string;
};

export async function probeAiModelCandidate(input: AiModelProbeInput): Promise<AiModelProbeResult> {
  const startedAt = Date.now();
  if (!input.modelId) return fail("模型 ID 必填", startedAt);
  if (!input.apiKey) return fail("API Key 未配置,无法测试", startedAt);
  if (input.role === "embedding" && !input.baseUrl) {
    return fail("向量模型须填 Base URL(openai 默认端点国内不可达)", startedAt);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(probeUrl(input), {
      method: "POST",
      headers: probeHeaders(input),
      body: probeBody(input),
      signal: controller.signal,
    });
    if (!res.ok) return fail(`通道返回 HTTP ${res.status}`, startedAt);
    return await interpretResponse(input, res, startedAt);
  } catch (err) {
    return fail(errorSummary(err), startedAt);
  } finally {
    clearTimeout(timer);
  }
}

function probeUrl(input: AiModelProbeInput): string {
  // anthropic 协议 SDK 拼 {base}/v1/messages(MiniMax/MiMo 的 anthropic 端点即此形态);
  // embedding 只可能是 openai 协议(绑定校验已拦)
  if (input.role === "embedding") return endpoint(input.baseUrl, "/embeddings");
  if (input.protocol === "anthropic") return endpoint(input.baseUrl, "/v1/messages");
  return endpoint(input.baseUrl, "/chat/completions");
}

function probeHeaders(input: AiModelProbeInput): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.protocol === "anthropic") {
    headers["x-api-key"] = input.apiKey ?? "";
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = `Bearer ${input.apiKey ?? ""}`;
  }
  return headers;
}

function probeBody(input: AiModelProbeInput): string {
  if (input.role === "embedding") {
    return JSON.stringify({ model: input.modelId, input: ["ping"] });
  }
  return JSON.stringify({
    model: input.modelId,
    // 思考模型(MiniMax-M3.1 等)先产出 thinking 块:max_tokens=1 时全部预算被
    // thinking 吃掉,MiniMax 会返回 content:null(HTTP 200)⇒ 给足预算让响应可校验
    max_tokens: 64,
    messages: [{ role: "user", content: "ping" }],
  });
}

/** HTTP 200 但响应不是协议预期结构时,从错误体摘录首行原因(两端常见 error.message / MiniMax base_resp) */
function protocolErrorHint(json: {
  error?: { message?: unknown };
  base_resp?: { status_msg?: unknown };
} | null): string {
  const candidates = [
    typeof json?.error?.message === "string" ? json.error.message : "",
    typeof json?.base_resp?.status_msg === "string" ? json.base_resp.status_msg : "",
  ].filter(Boolean);
  const first = candidates[0]?.split("\n")[0]?.trim();
  return first ? `通道报错:${first.slice(0, 120)}` : "响应结构不符合协议预期";
}

async function interpretResponse(
  input: AiModelProbeInput,
  res: Response,
  startedAt: number,
): Promise<AiModelProbeResult> {
  const json = (await res.json().catch(() => null)) as {
    type?: string;
    choices?: unknown[];
    content?: unknown[];
    data?: { embedding?: number[] }[];
    error?: { message?: unknown };
    base_resp?: { status_msg?: unknown };
  } | null;
  if (input.role === "embedding") {
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      return fail(protocolErrorHint(json), startedAt);
    }
    return { ok: true, message: `向量通道连通(维度 ${vec.length})`, latencyMs: Date.now() - startedAt };
  }
  // anthropic 探针判连通不判生成质量:思考模型可能只回 thinking 块
  // (甚至 max_tokens 仍耗尽时 content:null),content 数组(任意块型)
  // 或 message 信封都能证明端点/鉴权/协议三方可用
  const shaped =
    input.protocol === "anthropic"
      ? Array.isArray(json?.content) || json?.type === "message"
      : Array.isArray(json?.choices);
  if (!shaped) return fail(protocolErrorHint(json), startedAt);
  return {
    ok: true,
    message: `对话通道连通(模型 ${input.modelId})`,
    latencyMs: Date.now() - startedAt,
  };
}

/**
 * 已存条目测试:用库内已存值探测,结果落 last_test_*(无论成败)并写审计。
 * roles 多选时按「embedding 优先」探测(向量条件更苛刻,能过 embedding 就能过 chat 的协议面)。
 */
export async function testStoredAiModel(id: number, operatorId: bigint): Promise<AiModelProbeResult> {
  const row = await getAiModelStored(id);
  if (!row) throw new AiModelError("NOT_FOUND", "模型条目不存在。");
  let roles: AiModelRole[];
  try {
    roles = parseRoles(row.roles);
  } catch {
    roles = [];
  }
  const role: AiModelRole = roles.includes("embedding") ? "embedding" : "chat";
  const result = await probeAiModelCandidate({
    protocol: row.protocol as AiProtocol,
    role,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    modelId: row.modelId,
  });
  await prisma.aiModel.update({
    where: { id },
    data: {
      lastTestedAt: new Date(),
      lastTestStatus: result.ok ? "ok" : "fail",
      lastTestError: result.ok ? null : result.message.slice(0, 500),
      lastTestLatencyMs: result.latencyMs,
    },
  });
  // 审计只记 id/name 与成败/延迟,端点/密钥/错误正文均不落(规则 12 ⑤口径)
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_MODEL_TESTED,
    actorUserId: operatorId,
    payload: { id, name: row.name, ok: result.ok, latencyMs: result.latencyMs },
  });
  return result;
}
