import "server-only";

/**
 * LLM 通道探针(M8/M9):用**未保存的候选值**跑一次最小请求,
 * 证明「地址 + 密钥 + 模型」三件真的通——不落库先验证
 * (与 SOAP / 游戏库 / COS 探针同口径,见 settings/connection-test.ts)。
 *
 * 探针只发只读/无副作用的请求(1 token 补全、单条 embedding),
 * 响应体不回显(可能含密钥回显类信息),失败只给状态码与首行摘要。
 */

export type LlmProvider = "openai" | "anthropic";

export type LlmProbeResult = {
  ok: boolean;
  /** 成功=一句话结论;失败=脱敏后的原因摘要 */
  message: string;
  latencyMs: number;
};

const PROBE_TIMEOUT_MS = 15_000;

function fail(reason: string, startedAt: number): LlmProbeResult {
  return { ok: false, message: reason.slice(0, 200), latencyMs: Date.now() - startedAt };
}

function errorSummary(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "请求超时";
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split("\n")[0]?.slice(0, 200) || "网络错误";
}

/** 端点拼接:baseUrl 形如 https://gw.example.com/v1(尾斜杠容错) */
function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/**
 * 对话通道探针:openai 协议走 /chat/completions,anthropic 协议走 /messages。
 * 两个协议都发「1 token 补全」,只验连通性与鉴权,不计费量级。
 */
export async function probeLlmChat(channel: {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<LlmProbeResult> {
  const startedAt = Date.now();
  if (!channel.baseUrl || !channel.apiKey || !channel.model) {
    return fail("地址、密钥、模型三项须齐全才能测试", startedAt);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const anthropic = channel.provider === "anthropic";
    const res = await fetch(
      endpoint(channel.baseUrl, anthropic ? "/messages" : "/chat/completions"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(anthropic
            ? { "x-api-key": channel.apiKey, "anthropic-version": "2023-06-01" }
            : { authorization: `Bearer ${channel.apiKey}` }),
        },
        body: JSON.stringify(
          anthropic
            ? {
                model: channel.model,
                max_tokens: 1,
                messages: [{ role: "user", content: "ping" }],
              }
            : {
                model: channel.model,
                max_tokens: 1,
                messages: [{ role: "user", content: "ping" }],
              },
        ),
        signal: controller.signal,
      },
    );
    if (!res.ok) return fail(`通道返回 HTTP ${res.status}`, startedAt);
    const json = (await res.json()) as {
      choices?: unknown[];
      content?: unknown[];
    };
    const shaped = anthropic
      ? Array.isArray(json.content)
      : Array.isArray(json.choices);
    if (!shaped) return fail("响应结构不符合协议预期", startedAt);
    return {
      ok: true,
      message: `对话通道连通(模型 ${channel.model})`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return fail(errorSummary(err), startedAt);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 向量通道探针:openai 协议 /embeddings,单条输入;
 * 成功即回报维度(维度不一致会导致已有向量不可用,提前暴露)。
 */
export async function probeLlmEmbedding(channel: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<LlmProbeResult> {
  const startedAt = Date.now();
  if (!channel.baseUrl || !channel.apiKey || !channel.model) {
    return fail("地址、密钥、模型三项须齐全才能测试", startedAt);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint(channel.baseUrl, "/embeddings"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${channel.apiKey}`,
      },
      body: JSON.stringify({ model: channel.model, input: ["ping"] }),
      signal: controller.signal,
    });
    if (!res.ok) return fail(`通道返回 HTTP ${res.status}`, startedAt);
    const json = (await res.json()) as { data?: { embedding?: number[] }[] };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      return fail("响应缺少向量数据", startedAt);
    }
    return {
      ok: true,
      message: `向量通道连通(维度 ${vec.length})`,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return fail(errorSummary(err), startedAt);
  } finally {
    clearTimeout(timer);
  }
}
