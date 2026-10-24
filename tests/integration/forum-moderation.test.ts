import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import {
  getForumBoardBySlug,
  getForumThread,
  listBoardThreads,
  listForumBoards,
  listThreadPosts,
} from "@/server/services/forum/browse";
import {
  closeThread,
  deleteThread,
  ForumModerateError,
  labelThread,
  pinThread,
} from "@/server/services/forum/moderate";

/**
 * T036 US5 版主操作集成(quickstart S5,FR-220,SC-207):
 * pin/close/label 全审计 + label=closed 422 LABEL_INVALID + 软删后浏览不可见;
 * 浏览查询(版块聚合/主题列表排序/楼层)以 fixture 断言。guardUids 无 User 行,
 * 审计 actor 外键可空性由集成回归(与 admin-guard 同模式)。
 */
const RUN = Date.now().toString(36);
const BOARD_SLUG = `t36board-${RUN}`;
const MOD_UID = 9_900_036_001n; // 无 User 行(actor 可空场景)
const ACTOR = { id: MOD_UID };

let threadId = 0n;
let hiddenThreadId = 0n;

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ForumModerateError) return err.code;
    throw err;
  }
  throw new Error("expected ForumModerateError");
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const board = await prisma.forumBoard.create({
    data: { slug: BOARD_SLUG, name: "T36 版块", sort: 900 },
  });
  const mkThread = async (title: string, daysAgo: number) =>
    prisma.forumThread.create({
      data: {
        boardId: board.id,
        title,
        authorUserId: null,
        authorName: `旧玩家-${RUN}`,
        lastPostAt: new Date(Date.now() - daysAgo * 86_400_000),
        legacyWpTopicId: 9_936_000 + daysAgo,
      },
    });
  const t1 = await mkThread(`T36 置顶目标 ${RUN}`, 1);
  await mkThread(`T36 普通主题甲 ${RUN}`, 5);
  await mkThread(`T36 普通主题乙 ${RUN}`, 3);
  const hidden = await mkThread(`T36 待软删 ${RUN}`, 2);
  threadId = t1.id;
  hiddenThreadId = hidden.id;
  for (let floor = 1; floor <= 3; floor++) {
    await prisma.forumPost.create({
      data: {
        threadId: t1.id,
        floor,
        authorName: `楼层作者${floor}`,
        contentHtml: `<p>楼层 ${floor}</p>`,
        legacyWpPostId: 9_937_000 + floor,
      },
    });
  }
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: MOD_UID } });
  await prisma.forumPost.deleteMany({ where: { thread: { board: { slug: BOARD_SLUG } } } });
  await prisma.forumThread.deleteMany({ where: { board: { slug: BOARD_SLUG } } });
  await prisma.forumBoard.deleteMany({ where: { slug: BOARD_SLUG } });
  await prisma.$disconnect();
});

describe("浏览查询(T038)", () => {
  it("版块列表聚合主题数+最新主题", async () => {
    const boards = await listForumBoards();
    const mine = boards.find((b) => b.slug === BOARD_SLUG);
    expect(mine?.threadCount).toBe(4);
    expect(mine?.latestThread?.title).toContain("T36");
  });

  it("主题列表 pinned desc+lastPostAt desc;楼层 floor asc", async () => {
    const board = await getForumBoardBySlug(BOARD_SLUG);
    if (!board) throw new Error("board missing");
    const page = await listBoardThreads({ boardId: board.id });
    expect(page.total).toBe(4);
    expect(page.pageSize).toBe(20);
    const titles = page.items.map((t) => t.title);
    expect(titles[0]).toBe(`T36 置顶目标 ${RUN}`); // 新建未置顶时 lastPostAt 最新也在首位

    const posts = await listThreadPosts({ threadId });
    expect(posts.total).toBe(3);
    expect(posts.items.map((p) => p.floor)).toEqual([1, 2, 3]);
  });

  it("阅读计数原子自增(R2 Q7 口径)", async () => {
    const before = await prisma.forumThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { viewCount: true },
    });
    const { incrementThreadViews } = await import("@/server/services/forum/browse");
    await incrementThreadViews(threadId);
    const after = await prisma.forumThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { viewCount: true },
    });
    expect(after.viewCount).toBe(before.viewCount + 1);
  });
});

describe("版主操作(T036 SC-207)", () => {
  it("pin/close/label 全审计;close=true 双写 closedAt+statusLabel", async () => {
    const pinned = await pinThread(threadId, true, ACTOR);
    expect(pinned.pinned).toBe(true);
    const closed = await closeThread(threadId, true, ACTOR);
    expect(closed.closedAt).not.toBeNull();
    expect(closed.statusLabel).toBe("closed");
    const labeled = await labelThread(threadId, "standard", ACTOR);
    expect(labeled.statusLabel).toBe("standard");

    const actions = await prisma.auditLog.findMany({
      where: { actorUserId: MOD_UID, action: { startsWith: "forum_thread_" } },
      select: { action: true, payloadJson: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      "forum_thread_close",
      "forum_thread_label",
      "forum_thread_pin",
    ]);
    expect((actions.find((a) => a.action === "forum_thread_close")!.payloadJson as { closed?: boolean }).closed).toBe(true);
  });

  it("close=false 双清 closedAt+statusLabel", async () => {
    const reopened = await closeThread(threadId, false, ACTOR);
    expect(reopened.closedAt).toBeNull();
    expect(reopened.statusLabel).toBe("none");
  });

  it("label=closed 直传 422 LABEL_INVALID;未知主题 THREAD_NOT_FOUND", async () => {
    await expect(errCode(labelThread(threadId, "closed", ACTOR))).resolves.toBe(
      "LABEL_INVALID",
    );
    await expect(errCode(pinThread(9_999_999n, true, ACTOR))).resolves.toBe(
      "THREAD_NOT_FOUND",
    );
  });

  it("软删后浏览不可见(SC-207):列表/详情/楼层全过滤,数据保留", async () => {
    await deleteThread(hiddenThreadId, ACTOR);
    expect(await getForumThread(hiddenThreadId)).toBeNull();

    const board = await getForumBoardBySlug(BOARD_SLUG);
    if (!board) throw new Error("board missing");
    const page = await listBoardThreads({ boardId: board.id });
    expect(page.total).toBe(3);
    const posts = await listThreadPosts({ threadId: hiddenThreadId });
    expect(posts.total).toBe(0);

    const row = await prisma.forumThread.findUnique({ where: { id: hiddenThreadId } });
    expect(row?.deletedAt).not.toBeNull(); // 软删数据保留

    const delAudit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: MOD_UID, action: AUDIT_ACTION.FORUM_THREAD_DELETE },
      orderBy: { id: "desc" },
    });
    expect((delAudit.payloadJson as { title?: string }).title).toBe(`T36 待软删 ${RUN}`);
  });
});
