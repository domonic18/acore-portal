import "server-only";

import { isBaseMessage } from "@langchain/core/messages";
import type { Checkpoint } from "@langchain/langgraph-checkpoint";

import { prisma } from "@/lib/db/business";

import { MysqlCheckpointSaver } from "./mysql-saver";

/**
 * thread 消息读取(后台「AI 对话」详情):取 thread 最新 checkpoint,
 * 经 MysqlCheckpointSaver 的 serde 反序列化 channel_values.messages,
 * 只保留 human/ai 文本时间线(tool 检索帧与 ask_user 应答帧不进视图)。
 */

export interface AssistantThreadMessage {
  role: "user" | "assistant";
  content: string;
}

function textOfMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
          ? (block as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

export async function readAssistantThreadMessages(
  threadId: string,
): Promise<AssistantThreadMessage[]> {
  const row = await prisma.agentCheckpoint.findFirst({
    where: { threadId, checkpointNs: "" },
    orderBy: { checkpointId: "desc" },
  });
  if (!row) return [];
  const saver = new MysqlCheckpointSaver();
  const checkpoint = (await saver.serde.loadsTyped(
    row.type ?? "json",
    row.checkpoint,
  )) as Checkpoint;
  const raw = (checkpoint.channel_values as Record<string, unknown> | undefined)?.messages;
  if (!Array.isArray(raw)) return [];

  const out: AssistantThreadMessage[] = [];
  for (const msg of raw) {
    if (!isBaseMessage(msg)) continue;
    const type = msg.getType();
    if (type !== "human" && type !== "ai") continue;
    const content = textOfMessageContent(msg.content).trim();
    if (content) out.push({ role: type === "human" ? "user" : "assistant", content });
  }
  return out;
}
