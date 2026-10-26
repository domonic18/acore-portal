import { prisma } from "@/lib/db";
import { writeAudit } from "@/server/services/audit/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";

/**
 * 论坛版主操作(T038,FR-220;Q1 只读边界下唯一的写面):
 * 置顶/关闭/状态标签/软删,全部审计(category=forum,SC-207);
 * closed 仅经 close 接口设置,label 传 closed → LABEL_INVALID(契约 422)。
 * 审计在写库成功后落(与 content/admin.ts 同序);payload 只记 id/布尔/标签,不记正文。
 */

export class ForumModerateError extends Error {
  constructor(
    public readonly code:
      | "THREAD_NOT_FOUND"
      | "LABEL_INVALID",
  ) {
    super(code);
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

/** 软删:thread+楼层同事务 deletedAt(数据保留,SC-207);payload 含 title 快照 */
export async function deleteThread(id: bigint, actor: Actor) {
  const thread = await requireThread(id);
  const now = new Date();
  await prisma.$transaction([
    prisma.forumThread.update({ where: { id }, data: { deletedAt: now } }),
    prisma.forumPost.updateMany({ where: { threadId: id }, data: { deletedAt: now } }),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_DELETE,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), title: thread.title },
  });
}

/** 后台恢复(M4):与 deleteThread 对偶,事务清 thread+楼层 deletedAt(仅已删主题可达) */
export async function undeleteThread(id: bigint, actor: Actor) {
  const thread = await prisma.forumThread.findUnique({ where: { id } });
  if (!thread || !thread.deletedAt) throw new ForumModerateError("THREAD_NOT_FOUND");
  await prisma.$transaction([
    prisma.forumThread.update({ where: { id }, data: { deletedAt: null } }),
    prisma.forumPost.updateMany({ where: { threadId: id }, data: { deletedAt: null } }),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_THREAD_UNDELETE,
    actorUserId: actor.id,
    payload: { threadId: id.toString(), title: thread.title },
  });
}
