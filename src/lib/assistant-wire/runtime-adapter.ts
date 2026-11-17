"use client";
/**
 * 助手运行时防腐层(W7,对齐 aitech-hub 同族形态):集中 @assistant-ui/react-langgraph
 * 与自有 SSE 解析的全部集成点,Provider 只做装配。runs.stream 走自有 fetch——
 * 官方 langgraph-sdk 的 AsyncCaller 对非 2xx reject Response 且包装
 * new Error(response),message 变 "[object Response]",429 配额/503 降级
 * 无法分流。契约:threadId 客户端生成(无 threads 建删端点);resume 为纯
 * 字符串(LangGraphCommand 类型钉死 string,与本仓后端 zod 完全同形)。
 */
import { InMemoryThreadListAdapter } from "@assistant-ui/react";
import type {
  LangChainMessage,
  LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";

import { createSseEventReader } from "./sse";
import {
  ASSISTANT_API_BASE,
  WIRE_EVENTS,
  parseApiErrorMessage,
  parseWireErrorMessage,
} from "./wire";

export interface AssistantAdapterOptions {
  /** 后端会话 id 获取(发送时刻读当前受控值;SDK 本地乐观 id __LOCALID_* 不是后端契约) */
  getThreadId: () => string;
  /** 护栏前置拒绝(401 未登录/429 配额/503 通道未配)与 error 帧的人话上抛 */
  onError?: (message: string) => void;
}

/** 新提问取最后一条 human 文本(resume 时 messages 为空) */
function lastHumanContent(messages: LangChainMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.type !== "human") continue;
    if (typeof msg.content === "string") return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
    }
  }
  return "";
}

export interface AssistantAdapter {
  /** 线程列表适配:initialize 采用客户端生成的会话 id(后端无 threads 端点) */
  threadListAdapter: InMemoryThreadListAdapter;
  stream: LangGraphStreamCallback<LangChainMessage>;
  eventHandlers: {
    /** end 帧仅是后端收尾哨兵,无消费方;吞掉防 useLangGraphMessages 未知名 console.warn */
    onCustomEvent: (eventType: string, data: unknown) => void;
  };
}

export function createAssistantAdapter(
  options: AssistantAdapterOptions,
): AssistantAdapter {
  const threadListAdapter = new InMemoryThreadListAdapter();
  threadListAdapter.initialize = async () => {
    const id = options.getThreadId();
    return { remoteId: id, externalId: id };
  };
  // 切换历史会话(本仓单会话内存态)直接采用传入 id,不发 fetch
  threadListAdapter.fetch = async (threadId: string) => ({
    status: "regular" as const,
    remoteId: threadId,
    externalId: threadId,
  });

  const stream: LangGraphStreamCallback<LangChainMessage> = async function* (
    messages,
    { command, abortSignal, initialize },
  ) {
    // settled 后端会话 id(SDK 本地乐观 id __LOCALID_* 只进它的内部簿记)
    const { externalId } = await initialize();
    if (!externalId) throw new Error("会话尚未初始化");
    const threadId = externalId;
    const body =
      command?.resume !== undefined
        ? { resume: command.resume }
        : { messages: [{ content: lastHumanContent(messages) }] };

    let res: Response;
    try {
      res = await fetch(
        `${ASSISTANT_API_BASE}/threads/${threadId}/runs/stream`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: abortSignal,
        },
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e; // 用户主动停,静默
      const message = "网络连接异常,请稍后重试";
      options.onError?.(message);
      throw new Error(message);
    }
    if (!res.ok || !res.body) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        /* 代理 HTML 错误页等非 JSON,落状态码兜底 */
      }
      const message = parseApiErrorMessage(payload, res.status);
      options.onError?.(message);
      throw new Error(message);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const frames = createSseEventReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of frames.push(decoder.decode(value, { stream: true }))) {
          if (frame.event === WIRE_EVENTS.error) {
            options.onError?.(parseWireErrorMessage(frame.data) ?? "AI 通道异常,请稍后重试");
          }
          yield frame;
        }
      }
      for (const frame of frames.end()) {
        if (frame.event === WIRE_EVENTS.error) {
          options.onError?.(parseWireErrorMessage(frame.data) ?? "AI 通道异常,请稍后重试");
        }
        yield frame;
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* 流已断 */
      }
    }
  };

  return {
    threadListAdapter,
    stream,
    eventHandlers: {
      onCustomEvent: () => {},
    },
  };
}
