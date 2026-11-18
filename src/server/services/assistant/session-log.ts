import "server-only";

import { prisma } from "@/lib/db";
import { ADMIN_ASSISTANT_SESSION_PAGE_SIZE } from "@/constants/pagination";
import { pageSlice, totalPageCount } from "@/lib/pagination";

/**
 * 助手会话台账(2026-11-18,照 aitech-hub 形态):一行 = 一个 thread,
 * run 收尾 upsert 维护标题(首问截断)/提问数/token/最近活动。
 * 对话正文不落此表(仍在 agent_checkpoint),详情页经 checkpoint 反序列化读取。
 */

export interface AssistantSessionRecordInput {
  threadId: string;
  /** schema 可空(防御位);现行调用链必有会话用户 */
  userId: bigint | null;
  promptTokens: number;
  completionTokens: number;
  /** 原始提问:首问截断作会话标题,续跑轮不回填 */
  question?: string | null;
}

/** run 收尾写台账(失败轮也计入 runs/tokens;标题只在首建时落) */
export async function recordAssistantSession(input: AssistantSessionRecordInput): Promise<void> {
  const title = (input.question ?? "").trim().slice(0, 60);
  await prisma.assistantSession.upsert({
    where: { threadId: input.threadId },
    create: {
      threadId: input.threadId,
      userId: input.userId,
      title,
      runs: 1,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      lastMessageAt: new Date(),
    },
    update: {
      runs: { increment: 1 },
      promptTokens: { increment: input.promptTokens },
      completionTokens: { increment: input.completionTokens },
      lastMessageAt: new Date(),
    },
  });
}

export interface AssistantSessionListItem {
  threadId: string;
  title: string;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  createdAt: Date;
  lastMessageAt: Date;
  username: string;
  nickname: string;
  userRole: string;
}

/** 后台「AI 对话」列表:最近活动倒序 + 分页(用户名批量补齐) */
export async function listAssistantSessionsAdmin(opts: { page?: number }): Promise<{
  items: AssistantSessionListItem[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const { skip, take } = pageSlice(page, ADMIN_ASSISTANT_SESSION_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.assistantSession.count(),
    prisma.assistantSession.findMany({
      orderBy: { lastMessageAt: "desc" },
      skip,
      take,
    }),
  ]);

  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is bigint => v !== null))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, nickname: true, role: true },
      })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    page,
    totalPages: totalPageCount(total, ADMIN_ASSISTANT_SESSION_PAGE_SIZE),
    total,
    items: rows.map((r) => {
      const user = r.userId !== null ? byId.get(r.userId) : undefined;
      return {
        threadId: r.threadId,
        title: r.title,
        runs: r.runs,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        createdAt: r.createdAt,
        lastMessageAt: r.lastMessageAt,
        username: user?.username ?? "",
        nickname: user?.nickname ?? "",
        userRole: user?.role ?? "",
      };
    }),
  };
}
