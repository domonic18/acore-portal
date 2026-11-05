import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/services/shared/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";

/**
 * 论坛版主操作(T038,FR-220;2026-11-04 增删楼层能力):
 * 置顶/关闭/状态标签/软删,全部审计(category=forum,SC-207);
 * closed 仅经 close 接口设置,label 传 closed → LABEL_INVALID(契约 422)。
 * 审计在写库成功后落(与 content/admin.ts 同序);payload 只记 id/布尔/标签,不记正文。
 */

export class ForumModerateError extends Error {
  constructor(
    public readonly code:
      | "THREAD_NOT_FOUND"
      | "LABEL_INVALID"
      | "INVALID_FLOOR",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type ThreadStatusLabelValue = "none" | "standard" | "resolved" | "closed";

/** label 接口合法集(closed 仅经 close 接口设置,契约 422) */
export const LABEL_CHOICES = ["none", "standard", "resolved"] as const;
export type OpenStatusLabel = (typeof LABEL_CHOICES)[number];

type Actor = { id: bigint };

async function requireThread(id: bigint) {
  const thread = await prisma.forumThread.findUnique({ where: { id } });
  if (!thread || thread.deletedAt) throw new ForumModerateError("THREAD_NOT_FOUND");
  return thread;
}

export async function pinThread(id: bigint, pinned: boolean, actor: Actor) {
  const thread = await requireThread(id);
  const updated = await prisma.forumThread.update({ where: { id }, data: { pinned } });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_PIN,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), pinned },
  });
  return updated;
}

export async function closeThread(id: bigint, closed: boolean, actor: Actor) {
  const thread = await requireThread(id);
  const updated = await prisma.forumThread.update({
    where: { id },
    data: closed ? { closedAt: new Date(), statusLabel: "closed" } : { closedAt: null, statusLabel: "none" },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_CLOSE,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), closed },
  });
  return updated;
}

export async function labelThread(id: bigint, label: string, actor: Actor) {
  // closed 仅经 close 接口设置(路由层 zod 已拦一层,服务层契约性拒绝)
  if (!(LABEL_CHOICES as readonly string[]).includes(label)) {
    throw new ForumModerateError("LABEL_INVALID");
  }
  await requireThread(id);
  const updated = await prisma.forumThread.update({
    where: { id },
    data: { statusLabel: label as OpenStatusLabel },
  });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_LABEL,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), label },
  });
  return updated;
}

/**
 * 软删:thread+可见楼层同事务级联删除并标记 deletedViaThread(issue #69:
 * 已被独立删除的楼层保持原状态,恢复主题时不会误还原);payload 含 title 快照
 */
export async function deleteThread(id: bigint, actor: Actor) {
  const thread = await requireThread(id);
  const now = new Date();
  await prisma.$transaction([
    prisma.forumThread.update({ where: { id }, data: { deletedAt: now } }),
    prisma.forumPost.updateMany({
      where: { threadId: id, deletedAt: null },
      data: { deletedAt: now, deletedViaThread: true },
    }),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_DELETE,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), title: thread.title },
  });
}

/**
 * 后台恢复(M4):与 deleteThread 对偶,只还原本次级联删除的楼层
 * (deletedViaThread=true;issue #69 此前独立删除的楼层保持删除);
 * replyCount/lastPostAt 按真实可见楼层重算,消除派生计数与可见内容失配。
 */
export async function undeleteThread(id: bigint, actor: Actor) {
  const thread = await prisma.forumThread.findUnique({ where: { id } });
  if (!thread || !thread.deletedAt) throw new ForumModerateError("THREAD_NOT_FOUND");
  await prisma.$transaction(async (tx) => {
    await tx.forumThread.update({ where: { id }, data: { deletedAt: null } });
    await tx.forumPost.updateMany({
      where: { threadId: id, deletedViaThread: true },
      data: { deletedAt: null, deletedViaThread: false },
    });
    const [replyCount, lastReply] = await Promise.all([
      tx.forumPost.count({
        where: { threadId: id, deletedAt: null, floor: { not: POST_FLOOR_MAIN } },
      }),
      tx.forumPost.findFirst({
        where: { threadId: id, deletedAt: null, floor: { not: POST_FLOOR_MAIN } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    await tx.forumThread.update({
      where: { id },
      data: { replyCount, lastPostAt: lastReply?.createdAt ?? thread.createdAt },
    });
  });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_UNDELETE,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), title: thread.title },
  });
}

const POST_FLOOR_MAIN = 1;

/**
 * 版主删楼层(#34 软删口径):主贴(floor=1)不走此接口,引导用 deleteThread;
 * 事务内 deletedAt:null 条件更新做原子迁移(issue #70:并发删除同一楼层
 * 仅首个请求扣减 replyCount/落审计,后续请求拒绝);lastPostAt 重算。
 */
export async function deletePost(input: {
  threadId: bigint;
  postId: bigint;
  actor: Actor;
}): Promise<void> {
  const now = new Date();
  const floor = await prisma.$transaction(async (tx) => {
    const hit = await tx.forumPost.updateMany({
      where: {
        id: input.postId,
        threadId: input.threadId,
        deletedAt: null,
        floor: { not: POST_FLOOR_MAIN },
      },
      data: { deletedAt: now },
    });
    if (hit.count === 0) {
      const post = await tx.forumPost.findFirst({
        where: { id: input.postId, threadId: input.threadId },
        select: { floor: true, deletedAt: true },
      });
      if (!post || post.deletedAt) throw new ForumModerateError("THREAD_NOT_FOUND");
      throw new ForumModerateError("INVALID_FLOOR", "主贴请使用「删除主题」整体软删。");
    }
    const deleted = await tx.forumPost.findUniqueOrThrow({
      where: { id: input.postId },
      select: { floor: true },
    });
    const remaining = await tx.forumPost.findFirst({
      where: { threadId: input.threadId, deletedAt: null, floor: { not: POST_FLOOR_MAIN } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    await tx.forumThread.update({
      where: { id: input.threadId },
      data: {
        replyCount: { decrement: 1 },
        lastPostAt: remaining?.createdAt ?? (await tx.forumThread.findUniqueOrThrow({
          where: { id: input.threadId },
          select: { createdAt: true },
        })).createdAt,
      },
    });
    return deleted.floor;
  });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_POST_DELETED,
    actorUserId: input.actor.id,
    payload: {
      threadId: input.threadId.toString(),
      postId: input.postId.toString(),
      floor,
    },
  });
}
