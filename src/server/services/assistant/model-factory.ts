import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { resolveAiModel } from "@/server/services/shared/ai-models/resolver";

/**
 * 对话模型工厂(M9 W6;LLM 通道重构后读 ai_model/ai_role_binding 专表):
 * resolveAiModel("chat") 按 enabled 静态选边(主力→备用),双协议构造——
 * openai 走 configuration.baseURL,anthropic 走 anthropicApiUrl,超时透传条目值。
 * 解析为 null(未绑定/全停用)返回 null,调用方据此降级(助手不可用/纯关键词)。
 */
export async function createChatModel(): Promise<BaseChatModel | null> {
  const resolved = await resolveAiModel("chat");
  if (!resolved) return null;
  // apiKey 允许 null(无鉴权条目):SDK 层不接受 null,以 undefined 透传
  // (调用时通道 401 属运行期故障,探针可提前暴露;不在此拦是为了让「无鉴权也能配置」)
  const apiKey = resolved.apiKey ?? undefined;
  if (resolved.protocol === "anthropic") {
    return new ChatAnthropic({
      model: resolved.modelId,
      temperature: 0.3,
      maxRetries: 1,
      apiKey,
      anthropicApiUrl: resolved.baseUrl ?? undefined,
      // anthropic 的超时在 clientOptions(ChatAnthropicInput 无顶层 timeout 字段)
      clientOptions: { timeout: resolved.timeoutSec * 1000 },
    });
  }
  return new ChatOpenAI({
    model: resolved.modelId,
    temperature: 0.3,
    maxRetries: 1,
    timeout: resolved.timeoutSec * 1000,
    apiKey,
    configuration: { baseURL: resolved.baseUrl ?? undefined },
  });
}
