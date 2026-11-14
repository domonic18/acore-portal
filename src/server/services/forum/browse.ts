import { prisma } from "@/lib/db";
import {
  FORUM_POST_PAGE_SIZE,
  FORUM_THREAD_PAGE_SIZE,
} from "@/constants/pagination";

/**
 * 论坛浏览查询层(T038,FR-219;2026-11-04 开放登录用户发帖回帖,写路径见 write.ts/moderate.ts):
 * 版块列表(聚合主题数/回复数;#57 后前台不再展示板块内最新主题)/版块主题列表 20/页
 * (pinned desc+lastPostAt desc)/主题楼层 20/页(floor asc);软删(deletedAt)全域过滤;阅读数原子自增(R2 Q7 口径)。
 */
export async function listForumBoards() {
  const [boards, replyTotals] = await Promise.all([
    prisma.forumBoard.findMany({
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
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
    icon: b.icon,
    threadCount: b._count.threads,
    replyCount: replyByBoard.get(b.id.toString()) ?? 0,
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
      featured: true,
      closedAt: true,
      statusLabel: true,
      board: { select: { name: true, slug: true } },
    },
  });
}

/** 论坛首页右栏「最近回复」:floor>1 的回帖按时间倒序,带主题/版块与楼层(FR-219,p07) */
export async function listRecentForumReplies(limit = 5) {
  const posts = await prisma.forumPost.findMany({
    where: { floor: { gt: 1 }, deletedAt: null, thread: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      floor: true,
      authorName: true,
      createdAt: true,
      thread: {
        select: { id: true, title: true, board: { select: { name: true, slug: true } } },
      },
    },
  });
  return posts.map((p) => ({
    id: p.id.toString(),
    floor: p.floor,
    authorName: p.authorName,
    createdAt: p.createdAt,
    threadId: p.thread.id.toString(),
    threadTitle: p.thread.title,
    boardName: p.thread.board.name,
    boardSlug: p.thread.board.slug,
  }));
}

/** 首页「论坛精华」:加精优先,其次置顶,再按回复/浏览热度取前 N 条 */
export async function listHighlightedForumThreads(limit = 5) {
  return prisma.forumThread.findMany({
    where: { deletedAt: null },
    orderBy: [
      { featured: "desc" },
      { pinned: "desc" },
      { replyCount: "desc" },
      { viewCount: "desc" },
      { lastPostAt: "desc" },
    ],
    take: limit,
    select: {
      id: true,
      title: true,
      authorName: true,
      replyCount: true,
      pinned: true,
      featured: true,
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
        featured: true,
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
        legacyWpPostId: true,
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
