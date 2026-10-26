import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 后台论坛管理查询与版块 CRUD(M4):
 * adminListThreads 跨版块筛选(默认排除软删,deleted=1 专看回收站);
 * 版块增删改——删除要求版块下零主题(含已删,防孤儿楼层),slug 全站路由键
 * 允许修改但审计记 old/new。审计只记 id/slug/布尔,不记正文。
 */

export class ForumAdminError extends Error {
  constructor(
    public readonly code:
      | "BOARD_NOT_FOUND"
      | "BOARD_SLUG_DUPLICATE"
      | "BOARD_HAS_THREADS"
      | "SLUG_INVALID",
    message?: string,
  ) {
    super(message ?? `forum_admin_error: ${code}`);
    this.name = "ForumAdminError";
  }
}

export const ADMIN_FORUM_PAGE_SIZE = 20;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function adminListThreads(opts: {
  boardId?: bigint;
  q?: string;
  pinned?: boolean;
  closed?: boolean;
  label?: string;
  deleted?: boolean;
  page?: number;
}): Promise<{
  items: {
    id: string;
    title: string;
    boardSlug: string;
    boardName: string;
    authorName: string;
    pinned: boolean;
    closedAt: string | null;
    statusLabel: string;
    replyCount: number;
    lastPostAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const where: Prisma.ForumThreadWhereInput = {
    deletedAt: opts.deleted ? { not: null } : null,
  };
  if (opts.boardId) where.boardId = opts.boardId;
  if (opts.q?.trim()) where.title = { contains: opts.q.trim() };
  if (opts.pinned !== undefined) where.pinned = opts.pinned;
  if (opts.closed !== undefined) {
    where.closedAt = opts.closed ? { not: null } : null;
  }
  if (opts.label === "none" || opts.label === "standard" || opts.label === "resolved" || opts.label === "closed") {
    where.statusLabel = opts.label;
  }
  const [rows, total] = await Promise.all([
    prisma.forumThread.findMany({
      where,
      orderBy: [{ lastPostAt: "desc" }],
      skip: (page - 1) * ADMIN_FORUM_PAGE_SIZE,
      take: ADMIN_FORUM_PAGE_SIZE,
      include: { board: { select: { slug: true, name: true } } },
    }),
    prisma.forumThread.count({ where }),
  ]);
  return {
    page,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_FORUM_PAGE_SIZE)),
    total,
    items: rows.map((t) => ({
      id: t.id.toString(),
      title: t.title,
      boardSlug: t.board.slug,
      boardName: t.board.name,
      authorName: t.authorName,
      pinned: t.pinned,
      closedAt: t.closedAt?.toISOString() ?? null,
      statusLabel: t.statusLabel,
      replyCount: t.replyCount,
      lastPostAt: t.lastPostAt.toISOString(),
    })),
  };
}

// ===== 版块 CRUD =====

export async function listAdminBoards() {
  const boards = await prisma.forumBoard.findMany({
    orderBy: [{ sort: "asc" }, { id: "asc" }],
    include: { _count: { select: { threads: true } } },
  });
  return boards.map((b) => ({
    id: b.id.toString(),
    slug: b.slug,
    name: b.name,
    description: b.description,
    sort: b.sort,
    threadCount: b._count.threads,
  }));
}

function assertSlug(slug: string) {
  if (!SLUG_RE.test(slug) || slug.length > 64) {
    throw new ForumAdminError("SLUG_INVALID", "slug 仅允许小写字母/数字/连字符。");
  }
}

export async function createBoard(input: {
  slug: string;
  name: string;
  description?: string | null;
  sort?: number;
  actorId: bigint;
}): Promise<{ id: bigint }> {
  assertSlug(input.slug);
  try {
    const created = await prisma.forumBoard.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        sort: input.sort ?? 0,
      },
      select: { id: true },
    });
    await writeAudit({
      category: AUDIT_CATEGORY.FORUM,
      action: AUDIT_ACTION.FORUM_BOARD_SAVED,
      actorUserId: input.actorId,
      payload: { boardId: created.id.toString(), slug: input.slug, name: input.name, created: true },
    });
    return created;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ForumAdminError("BOARD_SLUG_DUPLICATE", "版块 slug 已存在。");
    }
    throw err;
  }
}

export async function updateBoard(input: {
  id: bigint;
  slug?: string;
  name?: string;
  description?: string | null;
  sort?: number;
  actorId: bigint;
}): Promise<void> {
  const board = await prisma.forumBoard.findUnique({ where: { id: input.id } });
  if (!board) throw new ForumAdminError("BOARD_NOT_FOUND", "版块不存在。");
  const slug = input.slug ?? board.slug;
  if (slug !== board.slug) assertSlug(slug);
  try {
    await prisma.forumBoard.update({
      where: { id: board.id },
      data: {
        slug,
        name: input.name ?? board.name,
        description: input.description ?? board.description,
        sort: input.sort ?? board.sort,
      },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      throw new ForumAdminError("BOARD_SLUG_DUPLICATE", "版块 slug 已存在。");
    }
    throw err;
  }
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_BOARD_SAVED,
    actorUserId: input.actorId,
    payload: {
      boardId: board.id.toString(),
      slug,
      ...(slug !== board.slug ? { oldSlug: board.slug } : {}),
      name: input.name ?? board.name,
    },
  });
}

/** 删除:版块下存在任何主题(含已删)即拒绝,防孤儿楼层 */
export async function deleteBoard(input: { id: bigint; actorId: bigint }): Promise<void> {
  const board = await prisma.forumBoard.findUnique({
    where: { id: input.id },
    include: { _count: { select: { threads: true } } },
  });
  if (!board) throw new ForumAdminError("BOARD_NOT_FOUND", "版块不存在。");
  if (board._count.threads > 0) {
    throw new ForumAdminError("BOARD_HAS_THREADS", "版块下仍有主题,禁止删除。");
  }
  await prisma.forumBoard.delete({ where: { id: board.id } });
  await writeAudit({
    category: AUDIT_CATEGORY.FORUM,
    action: AUDIT_ACTION.FORUM_BOARD_DELETED,
    actorUserId: input.actorId,
    payload: { boardId: board.id.toString(), slug: board.slug, name: board.name },
  });
}
