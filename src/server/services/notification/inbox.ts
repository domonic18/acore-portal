import "server-only";
import { prisma } from "@/lib/db";

/**
 * 收件箱查询/已读(契约 api-notification):
 * 全部 where userId 本人(越权防御=无跨用户寻址面);已读不可逆,删除不做(M4)。
 * 游标分页:createdAt desc, id desc;cursor=末条 id,重放同游标结果稳定。
 */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export type InboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type InboxPage = { items: InboxItem[]; nextCursor: string | null };

export async function listInbox(
  userId: bigint,
  cursor?: string,
  limit = DEFAULT_LIMIT,
): Promise<InboxPage> {
  const take = Math.min(Math.max(1, limit), MAX_LIMIT);
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items: InboxItem[] = rows.slice(0, take).map((r) => ({
    id: r.id.toString(),
    type: r.type,
    title: r.title,
    body: r.body,
    linkUrl: r.linkUrl,
    readAt: r.readAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

export async function unreadCount(userId: bigint): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/** 返回实际置读条数;ids 混入他人 id 时静默不计(无跨用户寻址) */
export async function markRead(
  userId: bigint,
  input: { ids?: bigint[]; all?: boolean },
): Promise<number> {
  const where = input.all
    ? { userId, readAt: null }
    : { userId, id: { in: input.ids ?? [] }, readAt: null };
  const result = await prisma.notification.updateMany({
    where,
    data: { readAt: new Date() },
  });
  return result.count;
}
