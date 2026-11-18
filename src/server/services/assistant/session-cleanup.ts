import "server-only";

import { prisma } from "@/lib/db/business";
import {
  ASSISTANT_SESSION_PRUNE_BATCH_LIMIT,
  ASSISTANT_SESSION_RETENTION_DAYS,
} from "@/constants/assistant";

/**
 * 助手会话生命周期原语(2026-11-18 存储健康度排查):
 *
 * 对话正文存在 LangGraph 检查点表(agent_checkpoint 每轮落一份全量状态快照、
 * agent_writes 落 superstep 中间写)⇒ 单会话存储随轮次平方增长;
 * 不回收会让业务库被沉睡会话撑爆。故本模块是「删除助手会话」的唯一写路径:
 * 后台手动删除与超期自动清理都走这里,避免两条路径漂移。
 *
 * 保留期锚点取 assistant_session.last_message_at(最近活动时刻,已有索引):
 * 近期活跃的会话不清理,沉睡会话才回收。
 * 孤儿检查点(有 checkpoint 无台账行,run 收尾写台账失败所致)不参与自动清理——
 * 检查点表无时间列,无法判定年龄,且可能在跑中的会话上误删。
 */

export type AssistantThreadDeleteResult = {
  threadId: string;
  /** 删除的中间写行数 */
  writes: number;
  /** 删除的检查点行数 */
  checkpoints: number;
  /** 删除的台账行数 */
  sessions: number;
};

/** 单事务清空一个会话的三处存储(检查点 / 中间写 / 台账) */
export async function deleteAssistantThread(threadId: string): Promise<AssistantThreadDeleteResult> {
  return prisma.$transaction(async (tx) => {
    const writes = await tx.agentWrites.deleteMany({ where: { threadId } });
    const checkpoints = await tx.agentCheckpoint.deleteMany({ where: { threadId } });
    const sessions = await tx.assistantSession.deleteMany({ where: { threadId } });
    return {
      threadId,
      writes: writes.count,
      checkpoints: checkpoints.count,
      sessions: sessions.count,
    };
  });
}

/** 保留期截止时刻:最近活动早于该时刻的会话即超期 */
export function expiredSessionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

/** 超期会话的 threadId 列表(按最近活动从旧到新,先回收最沉睡的) */
export async function listExpiredAssistantThreadIds(opts: {
  cutoff: Date;
  limit?: number;
}): Promise<string[]> {
  const rows = await prisma.assistantSession.findMany({
    where: { lastMessageAt: { lt: opts.cutoff } },
    orderBy: { lastMessageAt: "asc" },
    take: opts.limit ?? ASSISTANT_SESSION_PRUNE_BATCH_LIMIT,
    select: { threadId: true },
  });
  return rows.map((r) => r.threadId);
}

export type AssistantPruneResult = {
  retentionDays: number;
  /** 本次回收的截止时刻(ISO 串) */
  cutoff: string;
  /** 回收的会话数 */
  threads: number;
  /** 一并删除的行数(检查点 + 中间写 + 台账) */
  rows: number;
};

/**
 * 回收超期会话(周频自动清理与手工补跑共用):
 * 按保留期挑出沉睡会话,逐个走删除原语(单会话单事务,避免长事务锁表)。
 */
export async function pruneExpiredAssistantSessions(opts?: {
  now?: Date;
  retentionDays?: number;
  limit?: number;
}): Promise<AssistantPruneResult> {
  const retentionDays = opts?.retentionDays ?? ASSISTANT_SESSION_RETENTION_DAYS;
  const cutoff = expiredSessionCutoff(opts?.now ?? new Date(), retentionDays);
  const threadIds = await listExpiredAssistantThreadIds({
    cutoff,
    limit: opts?.limit,
  });

  let rows = 0;
  for (const threadId of threadIds) {
    const result = await deleteAssistantThread(threadId);
    rows += result.writes + result.checkpoints + result.sessions;
  }
  return { retentionDays, cutoff: cutoff.toISOString(), threads: threadIds.length, rows };
}
