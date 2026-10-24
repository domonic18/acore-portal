import { prisma } from "@/lib/db";

/**
 * 论坛浏览查询层(T038,FR-219;Q1 完全只读——零写路径):
 * 版块列表(聚合主题数/最新主题)/版块主题列表 20/页(pinned desc+lastPostAt desc)/
 * 主题楼层 20/页(floor asc);软删(deletedAt)全域过滤;阅读数原子自增(R2 Q7 口径)。
 */
export const FORUM_THREAD_PAGE_SIZE = 20;
export const FORUM_POST_PAGE_SIZE = 20;

export async function listForumBoards() {
  const boards = await prisma.forumBoard.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: {
      threads: {
        where: { deletedAt: null },
        orderBy: [{ lastPostAt: "desc" }],
        take: 1,
        select: { id: true, title: true, lastPostAt: true },
      },
      _count: { select: { threads: { where: { deletedAt: null } } } },
    },
  });
  return boards.map((b) => ({
    id: b.id.toString(),
    slug: b.slug,
    name: b.name,
    description: b.description,
    threadCount: b._count.threads,
    latestThread: b.threads[0]
      ? {
          id: b.threads[0].id.toString(),
          title: b.threads[0].title,
          lastPostAt: b.threads[0].lastPostAt,
        }
      : null,
  }));
}

export async function getForumBoardBySlug(slug: string) {
  return prisma.forumBoard.findUnique({ where: { slug } });
}

export async function listBoardThreads(opts: {
  boardId: bigint;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? FORUM_THREAD_PAGE_SIZE));
  const where = { boardId: opts.boardId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.forumThread.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { lastPostAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        authorUserId: true,
        authorName: true,
        pinned: true,
        closedAt: true,
        statusLabel: true,
        viewCount: true,
        replyCount: true,
        lastPostAt: true,
      },
    }),
    prisma.forumThread.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getForumThread(id: bigint) {
  return prisma.forumThread.findFirst({
    where: { id, deletedAt: null },
    include: { board: { select: { slug: true, name: true } } },
  });
}

export async function listThreadPosts(opts: {
  threadId: bigint;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? FORUM_POST_PAGE_SIZE));
  const where = { threadId: opts.threadId, deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.forumPost.findMany({
      where,
      orderBy: [{ floor: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        floor: true,
        authorUserId: true,
        authorName: true,
        contentHtml: true,
        createdAt: true,
      },
    }),
    prisma.forumPost.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** 阅读计数:每次详情访问 +1 原子自增(research R2;WP 对账口径 Q7) */
export async function incrementThreadViews(id: bigint) {
  await prisma.forumThread.update({ where: { id }, data: { viewCount: { increment: 1 } } });
}
