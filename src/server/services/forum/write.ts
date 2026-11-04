import "server-only";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { writeAudit } from "@/server/services/shared/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";

/**
 * 论坛发帖/回帖写路径(2026-11-04 开放 #34;先发后审——立即可见,版主可删):
 * 新帖正文以 Markdown 存入 contentHtml 列(存量帖为 HTML,渲染按
 * legacyWpPostId 判别:非空=存量走 renderLegacyHtml,空=新帖走 renderMarkdown)。
 * 审计在事务成功后落,payload 记 id/标题/楼层,正文不落(脱敏口径)。
 */

export class ForumWriteError extends Error {
  constructor(
    public readonly code:
      | "BOARD_NOT_FOUND"
      | "THREAD_NOT_FOUND"
      | "THREAD_CLOSED"
      | "FLOOR_CONFLICT",
  ) {
    super(code);
    this.name = "ForumWriteError";
  }
}

export type ForumAuthor = { id: bigint; name: string };

/** 发新主题:thread + 主贴(floor=1)同事务;statusLabel 从 none 起步,pinned=false */
export async function createThread(input: {
  boardId: bigint;
  author: ForumAuthor;
  title: string;
  content: string;
}): Promise<{ threadId: bigint }> {
  const board = await prisma.forumBoard.findUnique({
    where: { id: input.boardId },
    select: { id: true },
  });
  if (!board) throw new ForumWriteError("BOARD_NOT_FOUND");

  const now = new Date();
  const thread = await prisma.$transaction(async (tx) => {
    const created = await tx.forumThread.create({
      data: {
        boardId: input.boardId,
        title: input.title,
        authorUserId: input.author.id,
        authorName: input.author.name,
        lastPostAt: now,
      },
      select: { id: true },
    });
    await tx.forumPost.create({
      data: {
        threadId: created.id,
        floor: 1,
        authorUserId: input.author.id,
        authorName: input.author.name,
        contentHtml: input.content,
      },
    });
    return created;
  });

  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_CREATED,
    actorUserId: input.author.id,
    payload: { threadId: thread.id.toString(), boardId: input.boardId.toString(), title: input.title },
  });
  return { threadId: thread.id };
}

/** 回帖:closed/软删主题拒绝;floor 事务内 max+1,撞唯一约束上抛 P2002(路由 409) */
export async function createReply(input: {
  threadId: bigint;
  author: ForumAuthor;
  content: string;
}): Promise<{ postId: bigint; floor: number }> {
  const thread = await prisma.forumThread.findFirst({
    where: { id: input.threadId, deletedAt: null },
    select: { id: true, closedAt: true },
  });
  if (!thread) throw new ForumWriteError("THREAD_NOT_FOUND");
  if (thread.closedAt) throw new ForumWriteError("THREAD_CLOSED");

  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const maxFloor = await tx.forumPost.aggregate({
        where: { threadId: input.threadId },
        _max: { floor: true },
      });
      const floor = (maxFloor._max.floor ?? 0) + 1;
      const post = await tx.forumPost.create({
        data: {
          threadId: input.threadId,
          floor,
          authorUserId: input.author.id,
          authorName: input.author.name,
          contentHtml: input.content,
        },
        select: { id: true, floor: true },
      });
      await tx.forumThread.update({
        where: { id: input.threadId },
        data: { replyCount: { increment: 1 }, lastPostAt: now },
      });
      return { postId: post.id, floor: post.floor };
    });

    await writeAudit({
      category: AUDIT_CATEGORY.FORUM,
      action: AUDIT_ACTION.FORUM_POST_CREATED,
      actorUserId: input.author.id,
      payload: { threadId: input.threadId.toString(), postId: result.postId.toString(), floor: result.floor },
    });
    return result;
  } catch (err) {
    // 并发回帖撞 [threadId, floor] 唯一约束:路由层 409 提示刷新重试(低频社区可接受)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ForumWriteError("FLOOR_CONFLICT");
    }
    throw err;
  }
}
