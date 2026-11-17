import "server-only";

import { tool } from "@langchain/core/tools";
import { interrupt } from "@langchain/langgraph";
import { createDeepAgent, type DeepAgent } from "deepagents";
import { z } from "zod";

import { MysqlCheckpointSaver } from "./checkpointer/mysql-saver";
import { createChatModel } from "./model-factory";
import { ASSISTANT_SYSTEM_PROMPT } from "./prompt";
import { searchSiteTool } from "./search-tool";
import { resolveAiModel } from "@/server/services/shared/ai-models/resolver";

// checkpointer 无进程态(serde 内建),模块级单例随 agent 复用
const checkpointer = new MysqlCheckpointSaver();

/** ask_user HITL:模型缺关键信息时中断提问;checkpointer 落库,用户回复后 Command(resume) 续跑 */
const askUserTool = tool(
  ({ question }) => {
    const answer = interrupt({ question });
    return typeof answer === "string" && answer.length > 0 ? answer : "(用户未作答)";
  },
  {
    name: "ask_user",
    description: "当缺少关键信息无法回答时,向用户提出一个澄清问题并等待回复。",
    schema: z.object({ question: z.string().min(1).describe("要问用户的问题") }),
  },
);

// agent 组装含模型条目状态,后台改绑定/停用后按 key 重建;globalThis 防热重载多实例
const g = globalThis as typeof globalThis & {
  __assistantAgent?: { key: string; agent: DeepAgent };
};

/** 组装助手 Agent;chat 绑定解析不出启用条目返回 null(调用方降级「助手暂不可用」) */
export async function getAssistantAgent(): Promise<DeepAgent | null> {
  const resolved = await resolveAiModel("chat");
  const key = resolved ? `${resolved.id}|${resolved.protocol}|${resolved.baseUrl ?? ""}|${resolved.modelId}` : "";
  if (!resolved) return null;
  if (g.__assistantAgent?.key === key) return g.__assistantAgent.agent;
  const model = await createChatModel();
  if (!model) return null;
  const agent = createDeepAgent({
    model,
    tools: [searchSiteTool, askUserTool],
    systemPrompt: ASSISTANT_SYSTEM_PROMPT,
    checkpointer,
  });
  g.__assistantAgent = { key, agent };
  return agent;
}
