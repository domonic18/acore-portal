import "server-only";

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { getConfig } from "@/lib/config";

/**
 * 对话模型工厂(M9 W6):双协议 openai / anthropic,端点与密钥全部来自
 * system_config 的 llm 组(后台可改,热生效);模型绑定不写死。
 * 三件(baseUrl/apiKey/model)不齐返回 null,调用方据此降级(助手不可用/纯关键词)。
 */
export async function createChatModel(): Promise<BaseChatModel | null> {
  const { llm } = await getConfig();
  if (!llm.baseUrl || !llm.apiKey || !llm.model) return null;
  const shared = {
    model: llm.model,
    temperature: 0.3,
    maxRetries: 1,
    timeout: 120_000,
  };
  if (llm.provider === "anthropic") {
    // 用户自建网关同样可暴露 anthropic 协议(provider=anthropic 时 baseUrl 即网关地址)
    return new ChatAnthropic({ ...shared, apiKey: llm.apiKey, anthropicApiUrl: llm.baseUrl });
  }
  return new ChatOpenAI({
    ...shared,
    apiKey: llm.apiKey,
    configuration: { baseURL: llm.baseUrl },
  });
}
