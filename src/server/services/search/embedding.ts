import "server-only";

import { resolveAiModel } from "@/server/services/shared/ai-models/resolver";

/**
 * embedding 客户端(openai 协议 /embeddings,经 ai_model/ai_role_binding 专表配置,
 * LLM 通道重构前为 system_config llm.embedding.*)。绑定未配置 = 语义检索关闭
 * (getEmbeddingTexts 返回 null,调用方降级纯关键词,不报错);
 * 通道故障 = EmbeddingError(调用方 catch 后同口径降级)。
 */

export class EmbeddingError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`embedding 通道失败: ${reason}`);
    this.name = "EmbeddingError";
    this.reason = reason;
  }
}

/** 单批最大文本数(openai 协议惯例;网关侧限制未知,保守取小值) */
const EMBED_BATCH_SIZE = 16;
const EMBED_TIMEOUT_MS = 15_000;
/** 单文本截断(token 上限由模型定,按字符保守截断;索引文本与查询共用) */
const EMBED_MAX_CHARS = 2000;

/**
 * 语义检索是否可用:embedding 绑定解析出启用的 openai 协议条目才算可用
 * (anthropic 无 embedding 端点;可用性以实际调用成败兜底)。
 */
export async function isSemanticSearchEnabled(): Promise<boolean> {
  const resolved = await resolveAiModel("embedding");
  return resolved !== null && resolved.protocol === "openai" && resolved.apiKey !== null;
}

/**
 * 批量取向量(输入顺序与输出一一对应);未配置返回 null,调用方降级纯关键词。
 * 向量归一化后返回(配合点积=余弦的暴力扫)。
 */
export async function getEmbeddingTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const resolved = await resolveAiModel("embedding");
  if (!resolved || resolved.protocol !== "openai" || !resolved.apiKey) return null;

  const config = { baseUrl: resolved.baseUrl, model: resolved.modelId, apiKey: resolved.apiKey };
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE).map((t) => t.slice(0, EMBED_MAX_CHARS));
    out.push(...(await embedBatch(config, batch)));
  }
  return out;
}

async function embedBatch(
  config: { baseUrl: string | null; model: string; apiKey: string },
  batch: string[],
): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    if (!config.baseUrl) throw new EmbeddingError("Base URL 未配置");
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, input: batch }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // 不回显响应体(可能含密钥回显类信息),只记状态码
      throw new EmbeddingError(`HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    const data = json.data;
    if (!Array.isArray(data) || data.length !== batch.length) {
      throw new EmbeddingError("响应 data 与请求数不一致");
    }
    const byIndex = [...data].sort((a, b) => a.index - b.index);
    return byIndex.map((d) => normalize(d.embedding));
  } catch (err) {
    if (err instanceof EmbeddingError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new EmbeddingError("超时");
    }
    throw new EmbeddingError(err instanceof Error ? err.message : "网络错误");
  } finally {
    clearTimeout(timer);
  }
}

/** 归一化为单位向量;零向量(极端退化)原样返回(点积恒 0,不影响排序) */
function normalize(vec: number[]): number[] {
  const sumSq = vec.reduce((acc, v) => acc + v * v, 0);
  if (sumSq === 0) return vec;
  const norm = Math.sqrt(sumSq);
  return vec.map((v) => v / norm);
}
