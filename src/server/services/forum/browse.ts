import { prisma } from "@/lib/db";

/**
 * 论坛浏览查询层(T038,FR-219;Q1 完全只读——零写路径):
 * 版块列表(聚合主题数/最新主题)/版块主题列表 20/页(pinned desc+lastPostAt desc)/
 * 主题楼层 20/页(floor asc);软删(deletedAt)全域过滤;阅读数原子自增(R2 Q7 口径)。
 */
export const FORUM_THREAD_PAGE_SIZE = 20;
export const FORUM_POST_PAGE_SIZE = 20;

export async function listForumBoards() {
  const [boards, replyTotals] = await Promise.all([
    prisma.forumBoard.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      include: {
        threads: {
          where: { deletedAt: null },
          orderBy: [{ lastPostAt: "desc" }],
          take: 1,
          select: {
            id: true,
            title: true,
            authorName: true,
            lastPostAt: true,
            replyCount: true,
            pinned: true,
            closedAt: true,
            statusLabel: true,
          },
        },
        _count: { select: { threads: { where: { deletedAt: null } } } },
      },
    }),
    prisma.forumThread.groupBy({
      by: ["boardId"],
      where: { deletedAt: null },
      _sum: { replyCount: true },
    }),
  ]);
  const replyByBoard = new Map(
    replyTotals.map((r) => [r.boardId.toString(), r._sum.replyCount ?? 0]),
  );
  return boards.map((b) => ({
    id: b.id.toString(),
    slug: b.slug,
    name: b.name,
    description: b.description,
    threadCount: b._count.threads,
    replyCount: replyByBoard.get(b.id.toString()) ?? 0,
    latestThread: b.threads[0]
      ? {
          id: b.threads[0].id.toString(),
          title: b.threads[0].title,
          authorName: b.threads[0].authorName,
          lastPostAt: b.threads[0].lastPostAt,
          replyCount: b.threads[0].replyCount,
          pinned: b.threads[0].pinned,
          closedAt: b.threads[0].closedAt,
          statusLabel: b.threads[0].statusLabel,
        }
      : null,
  }));
}

/** 全站最新主题(论坛首页右栏;p07 设计稿) */
export async function listLatestForumThreads(limit = 5) {
  return prisma.forumThread.findMany({
    where: { deletedAt: null },
    orderBy: { lastPostAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      authorName: true,
      replyCount: true,
      pinned: true,
      closedAt: true,
      statusLabel: true,
      board: { select: { name: true, slug: true } },
    },
  });
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
        authorUser: { select: { role: true } },
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
