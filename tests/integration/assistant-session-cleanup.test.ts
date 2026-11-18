import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import {
  deleteAssistantThread,
  expiredSessionCutoff,
  listExpiredAssistantThreadIds,
  pruneExpiredAssistantSessions,
} from "@/server/services/assistant/session-cleanup";

/**
 * 助手会话生命周期(删除原语 + 超期回收)集成:
 * 助手对话正文存在 LangGraph 检查点表(每轮全量快照)⇒ 沉睡会话不回收会撑爆业务库。
 * 覆盖:删除原语清三表(检查点/中间写/台账)、超期判定锚点(last_message_at)、
 * 回收只删超期会话而留活跃会话。
 */

const PREFIX = `test-asst-${Date.now().toString(36)}`;
const DAY = 24 * 60 * 60 * 1000;

/** 造一个完整会话:台账行 + 一个检查点 + 一条中间写 */
async function seedSession(threadId: string, lastMessageAt: Date): Promise<void> {
  await prisma.assistantSession.create({
    data: {
      threadId,
      userId: null,
      title: "测试会话",
      runs: 1,
      promptTokens: 10,
      completionTokens: 20,
      createdAt: lastMessageAt,
      lastMessageAt,
    },
  });
  await prisma.agentCheckpoint.create({
    data: {
      threadId,
      checkpointNs: "",
      checkpointId: "ck-1",
      parentCheckpointId: "",
      type: "json",
      checkpoint: Buffer.from("{}"),
      metadata: {},
    },
  });
  await prisma.agentWrites.create({
    data: {
      threadId,
      checkpointNs: "",
      checkpointId: "ck-1",
      taskId: "task-1",
      taskPath: "",
      idx: 0,
      channel: "messages",
      type: "json",
      blob: Buffer.from("{}"),
    },
  });
}

async function countRows(threadId: string): Promise<number> {
  const [sessions, checkpoints, writes] = await Promise.all([
    prisma.assistantSession.count({ where: { threadId } }),
    prisma.agentCheckpoint.count({ where: { threadId } }),
    prisma.agentWrites.count({ where: { threadId } }),
  ]);
  return sessions + checkpoints + writes;
}

async function cleanup(): Promise<void> {
  await prisma.agentWrites.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.agentCheckpoint.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.assistantSession.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("助手会话删除原语", () => {
  it("deleteAssistantThread 单事务清三表,其他会话不受影响", async () => {
    const target = `${PREFIX}-del`;
    const other = `${PREFIX}-keep`;
    await seedSession(target, new Date());
    await seedSession(other, new Date());
    expect(await countRows(target)).toBe(3);

    const result = await deleteAssistantThread(target);
    expect(result).toMatchObject({ threadId: target, sessions: 1, checkpoints: 1, writes: 1 });
    expect(await countRows(target)).toBe(0);
    expect(await countRows(other)).toBe(3);
  });

  it("删除不存在的会话:零行删除且不抛错(幂等)", async () => {
    const result = await deleteAssistantThread(`${PREFIX}-none`);
    expect(result.sessions + result.checkpoints + result.writes).toBe(0);
  });
});

describe("超期会话回收", () => {
  it("只回收超期会话,活跃会话保留", async () => {
    const now = new Date("2026-11-18T00:00:00.000Z");
    const expired = `${PREFIX}-expired`;
    const active = `${PREFIX}-active`;
    await seedSession(expired, new Date(now.getTime() - 40 * DAY));
    await seedSession(active, new Date(now.getTime() - 1 * DAY));

    const cutoff = expiredSessionCutoff(now, 30);
    expect(cutoff.toISOString()).toBe("2026-10-19T00:00:00.000Z");

    const expiredIds = await listExpiredAssistantThreadIds({ cutoff });
    expect(expiredIds).toContain(expired);
    expect(expiredIds).not.toContain(active);

    const result = await pruneExpiredAssistantSessions({ now, retentionDays: 30 });
    expect(result.threads).toBe(expiredIds.length);
    expect(result.threads).toBeGreaterThanOrEqual(1);
    expect(result.retentionDays).toBe(30);
    expect(await countRows(expired)).toBe(0);
    expect(await countRows(active)).toBe(3);
  });

  it("保留期内的会话一条都不删", async () => {
    const now = new Date("2026-11-18T00:00:00.000Z");
    const fresh = `${PREFIX}-fresh`;
    await seedSession(fresh, new Date(now.getTime() - 29 * DAY));

    await pruneExpiredAssistantSessions({ now, retentionDays: 30 });
    expect(await countRows(fresh)).toBe(3);
  });
});
