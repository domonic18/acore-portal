import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import {
  FORUM_POST_PAGE_SIZE,
  FORUM_THREAD_PAGE_SIZE,
} from "@/constants/pagination";
import {
  FORUM_BOARD_TABS,
  type ForumBoardTabKey,
} from "@/constants/forum";
import { MODERATOR_ROLE_VALUES } from "@/constants/roles";

/**
 * 论坛浏览查询层(T038,FR-219;2026-11-04 开放登录用户发帖回帖,写路径见 write.ts/moderate.ts):
 * 版块列表(聚合主题数/回复数;#57 后前台不再展示板块内最新主题)/版块主题列表 20/页
 * (筛选 tab:latest=lastPostAt/hot=viewCount/replies=replyCount/featured=仅加精,置顶恒先)
 * /主题楼层 20/页(floor asc);软删(deletedAt)全域过滤;阅读数原子自增(R2 Q7 口径)。
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

/** 版块头统计(主题数在列表查询已有,这里补回复数与精华数,供头部与筛选 chip) */
export async function getForumBoardStats(boardId: bigint) {
  const [replySum, featuredCount] = await Promise.all([
    prisma.forumThread.aggregate({
      where: { boardId, deletedAt: null },
      _sum: { replyCount: true },
    }),
    prisma.forumThread.count({
      where: { boardId, deletedAt: null, featured: true },
    }),
  ]);
  return { replyCount: replySum._sum.replyCount ?? 0, featuredCount };
}

/** 版块头版主组:论坛版主是全局角色(moderator|admin),不按版块划分 */
export async function listForumModerators(limit = 5) {
  const users = await prisma.user.findMany({
    where: { role: { in: [...MODERATOR_ROLE_VALUES] }, status: "active" },
    select: { username: true },
    orderBy: { id: "asc" },
    take: limit,
  });
  return users.map((u) => u.username);
}

/** 主贴是否含图:floor=1 内容(存量=HTML / 新帖=Markdown)命中图片语法即视为带图 */
function postHasImage(content: string): boolean {
  return /<img[\s>]/i.test(content) || /!\[[^\]]*\]\([^)]+\)/.test(content);
}

/** 本页主题的最近回帖人(设计稿「最后回复」列;窗口函数一次取全页,免 N+1) */
async function mapLastRepliers(threadIds: bigint[]): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ thread_id: bigint; author_name: string }[]>(Prisma.sql`
    SELECT thread_id, author_name
    FROM (
      SELECT thread_id, author_name,
             ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC, id DESC) AS rn
      FROM forum_post
      WHERE deleted_at IS NULL AND thread_id IN (${Prisma.join(threadIds)})
    ) ranked
    WHERE rn = 1
  `);
  return new Map(rows.map((r) => [r.thread_id.toString(), r.author_name]));
}

export async function listBoardThreads(opts: {
  boardId: bigint;
  page?: number;
  pageSize?: number;
  tab?: ForumBoardTabKey;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? FORUM_THREAD_PAGE_SIZE));
  const tab: ForumBoardTabKey =
    opts.tab && FORUM_BOARD_TABS.some((t) => t.key === opts.tab) ? opts.tab : "latest";
  const where: Prisma.ForumThreadWhereInput = {
    boardId: opts.boardId,
    deletedAt: null,
    ...(tab === "featured" ? { featured: true } : {}),
  };
  const orderBy: Prisma.ForumThreadOrderByWithRelationInput[] =
    tab === "hot"
      ? [{ pinned: "desc" }, { viewCount: "desc" }]
      : tab === "replies"
        ? [{ pinned: "desc" }, { replyCount: "desc" }]
        : [{ pinned: "desc" }, { lastPostAt: "desc" }];
  const [threads, total] = await Promise.all([
    prisma.forumThread.findMany({
      where,
      orderBy,
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
        createdAt: true,
      },
    }),
    prisma.forumThread.count({ where }),
  ]);

  // 行级图形化信息批量补齐:主贴带图 + 最近回帖人(各一次查询,免行内 N+1)
  const ids = threads.map((t) => t.id);
  const [floorOnePosts, lastReplierByThread] = await Promise.all([
    prisma.forumPost.findMany({
      where: { threadId: { in: ids }, floor: 1, deletedAt: null },
      select: { threadId: true, contentHtml: true },
    }),
    mapLastRepliers(ids),
  ]);
  const hasImageByThread = new Map(
    floorOnePosts.map((p) => [p.threadId.toString(), postHasImage(p.contentHtml)]),
  );

  const items = threads.map((t) => ({
    ...t,
    hasImage: hasImageByThread.get(t.id.toString()) ?? false,
    lastReplierName: lastReplierByThread.get(t.id.toString()) ?? t.authorName,
  }));
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
