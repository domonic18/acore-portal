import "server-only";

import { randomUUID } from "node:crypto";

import { HumanMessage } from "@langchain/core/messages";
import { AIMessageChunk } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import type { DeepAgent } from "deepagents";

import { sseFrame, serializeMessage } from "./wire";

/**
 * 一轮问答的流式执行(M9 W6):agent.stream(messages+updates 双模式)→
 * LangGraph 兼容 SSE 帧(metadata → messages|updates → end)。
 * - messages 帧:元组 [消息, 元数据],AIMessageChunk 逐段透传(tool 调用增量包含在内)
 * - updates 帧:只透传含 __interrupt__ 的帧(ask_user 中断态),常规状态增量不上行
 * - 通道故障是业务结果:error 帧回显人话,不 5xx
 * - token 用量按 usage_metadata 聚合(一次模型调用一个总量,多调用求和)
 */
export interface AssistantRunStats {
  ok: boolean;
  promptTokens: number;
  completionTokens: number;
}

export interface AssistantRunParams {
  threadId: string;
  /** 新一轮提问(与 resume 二选一) */
  messages?: string[];
  /** 续跑 ask_user 的回答 */
  resume?: string;
}

export function createAssistantRunStream(agent: DeepAgent, params: AssistantRunParams) {
  const startedAt = Date.now();
  const stats: AssistantRunStats = { ok: false, promptTokens: 0, completionTokens: 0 };
  let finish!: () => void;
  const done = new Promise<{ stats: AssistantRunStats; durationMs: number }>((resolve) => {
    finish = () => resolve({ stats, durationMs: Date.now() - startedAt });
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(sseFrame(event, data)));

      send("metadata", { run_id: randomUUID() });
      try {
        const input = params.resume !== undefined
          ? new Command({ resume: params.resume })
          : { messages: params.messages?.map((c) => new HumanMessage(c)) ?? [] };
        const events = await agent.stream(input, {
          configurable: { thread_id: params.threadId },
          streamMode: ["messages", "updates"],
        });
        for await (const [mode, payload] of events) {
          if (mode === "messages") {
            const [chunk] = payload as unknown as [AIMessageChunk];
            const usage = chunk.usage_metadata;
            if (usage) {
              stats.promptTokens += usage.input_tokens ?? 0;
              stats.completionTokens += usage.output_tokens ?? 0;
            }
            // 元组帧 [消息, 元数据]:SDK 走 normalizeLangGraphTupleMessage →
            // appendLangChainChunk 累积,content 落 parts 数组(assistant-ui 渲染口径;
            // 扁平 partial 帧会让 SDK 原样存字符串 content,正文不渲染)
            send("messages", [serializeMessage(chunk), {}]);
          } else if (
            mode === "updates" &&
            payload &&
            typeof payload === "object" &&
            "__interrupt__" in payload
          ) {
            send("updates", payload);
          }
        }
        stats.ok = true;
      } catch {
        send("error", { message: "AI 通道异常,请稍后重试" });
      } finally {
        send("end", []);
        controller.close();
        finish();
      }
    },
  });

  return { stream, done };
}
