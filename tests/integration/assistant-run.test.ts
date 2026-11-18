import { afterAll, describe, expect, it } from "vitest";

import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, AIMessageChunk, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { RunnableLambda } from "@langchain/core/runnables";
import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { createDeepAgent, type DeepAgent } from "deepagents";
import { z } from "zod";

import { prisma } from "@/lib/db/business";
import { MysqlCheckpointSaver } from "@/server/services/assistant/checkpointer/mysql-saver";
import { createAssistantRunStream } from "@/server/services/assistant/run";

/**
 * 助手流式执行(M9 W6)集成:脚本模型驱动 deepagents,
 * 锚死 SSE wire 帧序(metadata→messages/partial→end)、消息序列化、
 * ask_user 中断的 updates 帧(未滤丢)与 resume 续跑、检查点落库。
 */

const PREFIX = `test-run-${Date.now().toString(36)}`;

/** 脚本模型:按序吐预设 AIMessage(可带 tool_calls),走完停在最后一条 */
class ScriptedModel extends BaseChatModel {
  lc_namespace = ["test", "scripted"];
  script: AIMessage[];
  private i = 0;

  constructor(script: AIMessage[]) {
    super({});
    this.script = script;
  }

  _modelType(): string {
    return "scripted";
  }

  _llmType(): string {
    return "scripted";
  }

  /** langchain v1 agent 强制要求工具调用模型;忽略工具定义,按脚本吐消息 */
  bindTools() {
    return RunnableLambda.from(async (input: BaseMessage[]) => {
      const result = await this._generate(input);
      const msg = result.generations[0]!.message as AIMessage;
      return new AIMessageChunk({ content: msg.content, tool_calls: msg.tool_calls, id: msg.id });
    });
  }

  async _generate(_messages: BaseMessage[]): Promise<ChatResult> {
    const msg = this.script[Math.min(this.i++, this.script.length - 1)]!;
    return {
      generations: [{ message: msg, text: typeof msg.content === "string" ? msg.content : "" }],
    };
  }
}

const askTool = tool(
  ({ q }) => {
    const answer = interrupt({ question: q }) as string;
    return `用户回复:${answer}`;
  },
  {
    name: "ask",
    description: "ask user",
    schema: z.object({ q: z.string().min(1) }),
  },
);

function buildAgent(model: BaseChatModel): DeepAgent {
  return createDeepAgent({
    model,
    tools: [askTool],
    systemPrompt: "test agent",
    checkpointer: new MysqlCheckpointSaver(),
  });
}

interface WireFrame {
  event: string;
  data: unknown;
}

function parseFrames(text: string): WireFrame[] {
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((raw) => {
      const event = /^event: (.+)$/m.exec(raw)?.[1] ?? "";
      const dataLine = /^data: (.+)$/m.exec(raw)?.[1] ?? "";
      return { event, data: dataLine ? (JSON.parse(dataLine) as unknown) : null };
    });
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

afterAll(async () => {
  await prisma.agentWrites.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.agentCheckpoint.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("createAssistantRunStream", () => {
  it("纯文本轮:帧序 metadata→messages×n→end,内容拼回原文,检查点落库", async () => {
    const agent = buildAgent(new FakeListChatModel({ responses: ["hello world test"] }));
    const threadId = `${PREFIX}-plain`;
    const { stream, done } = createAssistantRunStream(agent, {
      threadId,
      messages: ["你好"],
    });
    const frames = parseFrames(await readStream(stream));
    expect(frames[0]?.event).toBe("metadata");
    expect(frames.at(-1)?.event).toBe("end");

    const partials = frames.filter((f) => f.event === "messages");
    expect(partials.length).toBeGreaterThan(0);
    const text = partials
      .map((f) => {
        const tuple = f.data as [{ type: string; content: unknown }, unknown];
        const msg = tuple[0];
        return msg?.type === "ai" && typeof msg.content === "string" ? msg.content : "";
      })
      .join("");
    expect(text).toContain("hello world test");

    const { stats } = await done;
    expect(stats.ok).toBe(true);

    const rows = await prisma.agentCheckpoint.findMany({ where: { threadId } });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("ask_user 中断:updates 帧透传 __interrupt__;resume 后续跑到终答", async () => {
    const agent = buildAgent(
      new ScriptedModel([
        new AIMessage({
          content: "",
          tool_calls: [{ name: "ask", args: { q: "补充一下?" }, id: "call1", type: "tool_call" }],
        }),
        new AIMessage({ content: "done text" }),
      ]),
    );
    const threadId = `${PREFIX}-hitl`;

    // 第一段:模型发起 ask 工具 → 工具体内 interrupt() 拦下 → __interrupt__ 上行
    const run1 = createAssistantRunStream(agent, { threadId, messages: ["问一下"] });
    const frames1 = parseFrames(await readStream(run1.stream));
    const updates = frames1.filter((f) => f.event === "updates");
    expect(updates.length).toBeGreaterThan(0);
    expect(Object.keys(updates[0]?.data as object)).toContain("__interrupt__");

    // 第二段:resume 续跑 → 工具拿到回答 → 第二条脚本消息作终答
    const run2 = createAssistantRunStream(agent, { threadId, resume: "答案是 42" });
    const frames2 = parseFrames(await readStream(run2.stream));
    const text = frames2
      .filter((f) => f.event === "messages")
      .map((f) => {
        const tuple = f.data as [{ type: string; content: unknown }, unknown];
        const msg = tuple[0];
        return msg?.type === "ai" && typeof msg.content === "string" ? msg.content : "";
      })
      .join("");
    expect(text).toContain("done text");
    const { stats } = await run2.done;
    expect(stats.ok).toBe(true);
  });
});
