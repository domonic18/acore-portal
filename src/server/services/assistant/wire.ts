import "server-only";

import type { BaseMessage } from "@langchain/core/messages";

/**
 * LangGraph 兼容 SSE wire 协议(M9 W6,W7 防腐层消费):
 * 帧序 metadata → messages|updates → end;messages 为 [消息, 元数据] 元组
 * (SDK normalizeLangGraphTupleMessage 口径,逐 chunk 累积)。
 * 消息按 langgraph SDK 口径序列化(type: ai/human/tool + content),
 * 只携前端渲染所需字段,不透传 additional_kwargs 内的类实例。
 */

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** langgraph SDK 口径的消息序列化;tool 调用增量一并透传(防腐层组装 tool 气泡) */
export function serializeMessage(msg: BaseMessage): Record<string, unknown> {
  const type = msg.getType();
  const out: Record<string, unknown> = {
    id: msg.id,
    type: type === "ai" || type === "human" || type === "tool" ? type : "generic",
    content: msg.content,
  };
  const chunk = msg as BaseMessage & {
    tool_call_chunks?: unknown[];
    tool_call_id?: string;
    name?: string;
    usage_metadata?: Record<string, number> | null;
  };
  if (chunk.tool_call_chunks?.length) out.tool_call_chunks = chunk.tool_call_chunks;
  if (chunk.tool_call_id) out.tool_call_id = chunk.tool_call_id;
  if (chunk.name) out.name = chunk.name;
  if (chunk.usage_metadata) out.usage_metadata = chunk.usage_metadata;
  return out;
}
