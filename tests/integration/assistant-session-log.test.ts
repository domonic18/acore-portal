import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Checkpoint } from "@langchain/langgraph-checkpoint";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

import { prisma } from "@/lib/db/business";
import { MysqlCheckpointSaver } from "@/server/services/assistant/checkpointer/mysql-saver";
import { readAssistantThreadMessages } from "@/server/services/assistant/checkpointer/thread-log";
import {
  listAssistantSessionsAdmin,
  recordAssistantSession,
} from "@/server/services/assistant/session-log";

/**
 * 助手会话台账(2026-11-18,照 aitech-hub 形态)集成:
 * run 收尾 upsert 语义(标题只落首问/runs·token 累计)、后台列表分页与用户补齐、
 * thread 消息读取(checkpoint 反序列化,只保留 human/ai 文本)。
 */

const RUN = Date.now().toString(36);
const THREAD_PREFIX = `test-sess-${RUN}`;
const saver = new MysqlCheckpointSaver();
const userIds: bigint[] = [];

async function makeUser(tag: string, role: "user" | "admin" = "user") {
  const username = `t_${RUN}_sess_${tag}`.slice(0, 32);
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `sesstest$${username}`,
      passwordAlgo: "bcrypt_wp",
      role,
    },
    select: { id: true, username: true, nickname: true, role: true },
  });
  userIds.push(user.id);
  return user;
}

async function cleanup() {
  await prisma.assistantSession.deleteMany({ where: { threadId: { startsWith: THREAD_PREFIX } } });
  await prisma.agentCheckpoint.deleteMany({ where: { threadId: { startsWith: THREAD_PREFIX } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

beforeAll(async () => {
  await cleanup();
  await makeUser("a");
  await makeUser("b");
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("recordAssistantSession upsert 语义", () => {
  it("首建落标题(截断 60);续跑轮累计 runs/token 且不回填标题", async () => {
    const threadId = `${THREAD_PREFIX}-upsert`;
    await recordAssistantSession({
      threadId,
      userId: userIds[0]!,
      promptTokens: 100,
      completionTokens: 20,
      question: "法师怎么加点",
    });
    await recordAssistantSession({
      threadId,
      userId: userIds[0]!,
      promptTokens: 80,
      completionTokens: 30,
      question: "这个标题不应回填",
    });

    const row = await prisma.assistantSession.findUnique({ where: { threadId } });
    expect(row?.title).toBe("法师怎么加点");
    expect(row?.runs).toBe(2);
    expect(row?.promptTokens).toBe(180);
    expect(row?.completionTokens).toBe(50);
    expect(row?.userId).toBe(userIds[0]);
  });

  it("无 question 的 run 也能建行(标题空串)", async () => {
    const threadId = `${THREAD_PREFIX}-resume`;
    await recordAssistantSession({
      threadId,
      userId: userIds[0]!,
      promptTokens: 10,
      completionTokens: 5,
      question: null,
    });
    const row = await prisma.assistantSession.findUnique({ where: { threadId } });
    expect(row?.title).toBe("");
    expect(row?.runs).toBe(1);
  });
});

describe("listAssistantSessionsAdmin", () => {
  it("按最近活动倒序 + 用户信息补齐 + 缺用户回落空串", async () => {
    const t1 = `${THREAD_PREFIX}-list-a`;
    const t2 = `${THREAD_PREFIX}-list-b`;
    await recordAssistantSession({
      threadId: t1,
      userId: userIds[1]!,
      promptTokens: 1,
      completionTokens: 1,
      question: "旧会话",
    });
    await recordAssistantSession({
      threadId: t2,
      userId: null,
      promptTokens: 1,
      completionTokens: 1,
      question: "新会话无用户",
    });

    const { items, total, totalPages, page } = await listAssistantSessionsAdmin({ page: 1 });
    expect(page).toBe(1);
    expect(totalPages).toBeGreaterThanOrEqual(1);
    const mine = items.filter((r) => r.threadId === t1 || r.threadId === t2);
    expect(mine.map((r) => r.threadId)).toEqual([t2, t1]);
    const withUser = mine.find((r) => r.threadId === t1);
    expect(withUser?.username).toContain(RUN);
    expect(withUser?.userRole).toBe("user");
    const noUser = mine.find((r) => r.threadId === t2);
    expect(noUser?.username).toBe("");
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("超界页码回空 items 且不报错", async () => {
    const { items } = await listAssistantSessionsAdmin({ page: 99999 });
    expect(items).toEqual([]);
  });
});

describe("readAssistantThreadMessages", () => {
  function ckpt(id: string, values: Record<string, unknown>): Checkpoint {
    return {
      v: 4,
      id,
      ts: new Date().toISOString(),
      channel_values: values,
      channel_versions: { __root__: "1" },
      versions_seen: { __start__: {} },
    };
  }
  const cfg = (threadId: string) => ({
    configurable: { thread_id: threadId, checkpoint_ns: "" },
  });

  it("反序列化最新 checkpoint,只保留 human/ai 文本时间线", async () => {
    const threadId = `${THREAD_PREFIX}-msg`;
    await saver.put(
      cfg(threadId),
      ckpt("19000000-0000-0000-0000-000000000001", {
        messages: [
          new HumanMessage("法师怎么加点"),
          new AIMessage({
            content: [
              { type: "text", text: "优先智力," },
              { type: "text", text: "其次耐力。" },
            ],
          }),
          new ToolMessage({ content: "检索结果", tool_call_id: "call-1" }),
        ],
      }),
      { source: "loop", step: 1, parents: {} },
      {},
    );

    const messages = await readAssistantThreadMessages(threadId);
    expect(messages).toEqual([
      { role: "user", content: "法师怎么加点" },
      { role: "assistant", content: "优先智力,其次耐力。" },
    ]);
  });

  it("无 checkpoint 的 thread 回空数组", async () => {
    expect(await readAssistantThreadMessages(`${THREAD_PREFIX}-missing`)).toEqual([]);
  });
});
