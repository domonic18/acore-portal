import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { writeAudit } from "@/server/services/shared/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { NOTIFICATION_TYPE } from "@/constants/notification";
import {
  THREAD_LABEL_OPTIONS,
  type ThreadStatusLabelValue,
} from "@/constants/forum";

/**
 * 论坛版主操作(T038,FR-220;2026-11-04 增删楼层能力):
 * 置顶/加精/关闭/状态标签/软删,全部审计(category=forum,SC-207);
 * 审计在写库成功后落(与 content/admin.ts 同序);payload 只记 id/布尔/标签,不记正文。
 *
 * 状态写入只有一个出口(writeThreadStatus):status_label 与 closed_at 同写,
 * closed ⇔ closed_at 非空 —— 回帖闸、徽标、筛选都读这一对,杜绝两处状态漂移。
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

/** 版主加精/取消加精:标题前显示「精」标识(与置顶互不干扰) */
export async function featureThread(id: bigint, featured: boolean, actor: Actor) {
  const thread = await requireThread(id);
  const updated = await prisma.forumThread.update({ where: { id }, data: { featured } });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_FEATURED,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), featured },
  });
  return updated;
}

/**
 * 状态写入的唯一出口:
 * - status=closed ⇒ status_label=closed + closed_at=now(关闭后禁回帖);
 * - 其余状态 ⇒ status_label=status + closed_at=null(离开关闭态即重开)。
 * 审计与「请补充」通知同事务:通知落库失败则状态回滚,不留「提示已发但状态没改」。
 */
async function writeThreadStatus(
  id: bigint,
  status: ThreadStatusLabelValue,
  actor: Actor,
  audit: { action: string; payload: Record<string, unknown> },
) {
  const thread = await requireThread(id);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.forumThread.update({
      where: { id },
      data:
        status === "closed"
          ? { statusLabel: "closed", closedAt: thread.closedAt ?? new Date() }
          : { statusLabel: status, closedAt: null },
    });
    await writeAudit(
      {
        category: AUDIT_CATEGORY.FORUM,
        action: audit.action,
        actorUserId: actor.id,
        payload: { threadId: id.toString(), ...audit.payload },
      },
      tx,
    );
    // 「请补充」才发一次:重复标记同一状态不重复打扰发帖人
    if (status === "needs_info" && thread.statusLabel !== "needs_info") {
      await notifyNeedsInfo(tx, thread, actor);
    }
    return row;
  });
  return updated;
}

/**
 * 「请补充」提示发帖人(站内信,type=forum):
 * 作者未映射(存量帖)无从寻址、版主标记自己的帖不通知自己。
 */
async function notifyNeedsInfo(
  tx: Prisma.TransactionClient,
  thread: { id: bigint; title: string; authorUserId: bigint | null },
  actor: Actor,
): Promise<void> {
  if (!thread.authorUserId || thread.authorUserId === actor.id) return;
  const title = thread.title.length > 40 ? `${thread.title.slice(0, 40)}…` : thread.title;
  await tx.notification.create({
    data: {
      userId: thread.authorUserId,
      type: NOTIFICATION_TYPE.FORUM,
      title: "帖子需要补充信息",
      body: `版主将你的帖子《${title}》标记为「请补充」,请补充更多信息后再继续讨论。`,
      linkUrl: `/forum/thread/${thread.id}`,
    },
  });
}

export async function closeThread(id: bigint, closed: boolean, actor: Actor) {
  return writeThreadStatus(
    id,
    closed ? "closed" : "none",
    actor,
    { action: AUDIT_ACTION.FORUM_THREAD_CLOSE, payload: { closed } },
  );
}

/**
 * 状态标签流转(状态下拉):none/resolved/needs_info/closed 均可选
 * (选 closed 即关闭主题,关闭后不再接受回帖)。
 */
export async function labelThread(id: bigint, label: string, actor: Actor) {
  if (!(THREAD_LABEL_OPTIONS as readonly string[]).includes(label)) {
    throw new ForumModerateError("LABEL_INVALID");
  }
  return writeThreadStatus(
    id,
    label as ThreadStatusLabelValue,
    actor,
    { action: AUDIT_ACTION.FORUM_THREAD_LABEL, payload: { label } },
  );
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
