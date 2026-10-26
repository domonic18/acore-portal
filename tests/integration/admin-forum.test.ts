import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import { getForumThread, listThreadPosts } from "@/server/services/forum/browse";
import { deleteThread, ForumModerateError, undeleteThread } from "@/server/services/forum/moderate";
import {
  adminListThreads,
  createBoard,
  deleteBoard,
  ForumAdminError,
  listAdminBoards,
  updateBoard,
} from "@/server/services/forum/admin";

/**
 * M4 后台论坛管理集成:
 * adminListThreads 跨版块筛选(版块/关键词/置顶/关闭/标签/回收站) /
 * undeleteThread 与 deleteThread 对偶(楼层恢复+审计) /
 * 版块 CRUD(slug 校验/唯一/改名审计 old+new/有主题删除拒绝)。
 */
const RUN = Date.now().toString(36);
const ACTOR_UID = 9_950_036_001n;
const ACTOR = { id: ACTOR_UID };

let boardAId = 0n;
let boardBId = 0n;
let tPinned = 0n;
let tClosed = 0n;
let tLabeled = 0n;
let tDeleted = 0n;
let tPlain = 0n;

async function errCode(promise: Promise<unknown>, kind: "moderate" | "admin"): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (kind === "moderate" && err instanceof ForumModerateError) return err.code;
    if (kind === "admin" && err instanceof ForumAdminError) return err.code;
    throw err;
  }
  throw new Error("expected error");
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const boardA = await prisma.forumBoard.create({
    data: { slug: `adm36a-${RUN}`, name: "后台A版块", sort: 900 },
  });
  const boardB = await prisma.forumBoard.create({
    data: { slug: `adm36b-${RUN}`, name: "后台B版块", sort: 901 },
  });
  boardAId = boardA.id;
  boardBId = boardB.id;
  const mk = async (
    boardId: bigint,
    title: string,
    extra: {
      pinned?: boolean;
      closed?: boolean;
      label?: "standard" | "resolved" | "closed";
      daysAgo: number;
    },
  ) =>
    prisma.forumThread.create({
      data: {
        boardId,
        title,
        authorUserId: null,
        authorName: `作者-${RUN}`,
        pinned: extra.pinned ?? false,
        closedAt: extra.closed ? new Date() : null,
        statusLabel: extra.label ?? "none",
        lastPostAt: new Date(Date.now() - extra.daysAgo * 86_400_000),
        legacyWpTopicId: 9_960_000 + extra.daysAgo,
      },
    });
  tPinned = (await mk(boardAId, `后台置顶 ${RUN}`, { pinned: true, daysAgo: 1 })).id;
  tClosed = (await mk(boardAId, `后台关闭 ${RUN}`, { closed: true, label: "closed", daysAgo: 2 })).id;
  tLabeled = (await mk(boardAId, `后台已解决 ${RUN}`, { label: "resolved", daysAgo: 3 })).id;
  tPlain = (await mk(boardBId, `后台普通 ${RUN}`, { daysAgo: 4 })).id;
  const del = await mk(boardBId, `后台待恢复 ${RUN}`, { daysAgo: 5 });
  tDeleted = del.id;
  await deleteThread(tDeleted, ACTOR);
  await prisma.forumPost.create({
    data: {
      threadId: tDeleted,
      floor: 1,
      authorName: `楼主-${RUN}`,
      contentHtml: "<p>主贴</p>",
      legacyWpPostId: 9_961_001,
    },
  });
});

afterAll(async () => {
  // 前缀清理(adm36/admcrud 前缀为本测试专用):历史轮次 afterAll 未清成时自愈
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR_UID } });
  await prisma.forumPost.deleteMany({
    where: { thread: { board: { slug: { startsWith: "adm36" } } } },
  });
  await prisma.forumThread.deleteMany({ where: { board: { slug: { startsWith: "adm36" } } } });
  await prisma.forumBoard.deleteMany({ where: { slug: { startsWith: "adm36" } } });
  await prisma.forumPost.deleteMany({
    where: { thread: { board: { slug: { startsWith: "admcrud" } } } },
  });
  await prisma.forumThread.deleteMany({ where: { board: { slug: { startsWith: "admcrud" } } } });
  await prisma.forumBoard.deleteMany({ where: { slug: { startsWith: "admcrud" } } });
  await prisma.$disconnect();
});

describe("adminListThreads(跨版块筛选)", () => {
  it("默认排除软删;deleted=1 专看回收站", async () => {
    const normal = await adminListThreads({ page: 1 });
    const mine = normal.items.filter((t) => t.title.includes(RUN));
    expect(mine).toHaveLength(4);
    expect(mine.some((t) => t.id === tDeleted.toString())).toBe(false);

    const trash = await adminListThreads({ deleted: true, page: 1 });
    expect(trash.items.filter((t) => t.title.includes(RUN))).toHaveLength(1);
    expect(trash.items[0]!.id).toBe(tDeleted.toString());
  });

  it("版块/关键词/置顶/关闭/标签 单项筛选各命中", async () => {
    const byBoard = await adminListThreads({ boardId: boardAId });
    expect(byBoard.items.every((t) => t.title.includes(RUN))).toBe(true);
    expect(byBoard.items).toHaveLength(3);

    expect((await adminListThreads({ q: `后台置顶 ${RUN}` })).items).toHaveLength(1);
    expect((await adminListThreads({ pinned: true })).items.some((t) => t.id === tPinned.toString())).toBe(true);
    expect((await adminListThreads({ closed: true })).items.some((t) => t.id === tClosed.toString())).toBe(true);
    expect((await adminListThreads({ label: "resolved" })).items.some((t) => t.id === tLabeled.toString())).toBe(true);
  });

  it("行数据带版块冗余与状态字段", async () => {
    const row = (await adminListThreads({ q: `后台关闭 ${RUN}` })).items[0]!;
    expect(row.boardSlug).toBe(`adm36a-${RUN}`);
    expect(row.boardName).toBe("后台A版块");
    expect(row.statusLabel).toBe("closed");
    expect(row.closedAt).not.toBeNull();
  });
});

describe("undeleteThread(回收站恢复)", () => {
  it("恢复 thread+楼层且审计;未删主题不可恢复", async () => {
    await undeleteThread(tDeleted, ACTOR);
    expect(await getForumThread(tDeleted)).not.toBeNull();
    expect((await listThreadPosts({ threadId: tDeleted })).total).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.FORUM_THREAD_UNDELETE },
    });
    expect((audit.payloadJson as { title?: string }).title).toBe(`后台待恢复 ${RUN}`);

    await expect(errCode(undeleteThread(tPlain, ACTOR), "moderate")).resolves.toBe(
      "THREAD_NOT_FOUND",
    );
  });
});

describe("版块 CRUD", () => {
  it("新建+slug 唯一+非法 slug", async () => {
    const created = await createBoard({
      slug: `admcrud-${RUN}`,
      name: "CRUD 版块",
      description: "临时",
      sort: 9,
      actorId: ACTOR_UID,
    });
    expect(created.id).toBeGreaterThan(0n);
    await expect(
      errCode(
        createBoard({ slug: `admcrud-${RUN}`, name: "撞名", actorId: ACTOR_UID }),
        "admin",
      ),
    ).resolves.toBe("BOARD_SLUG_DUPLICATE");
    await expect(
      errCode(createBoard({ slug: "Bad Slug!", name: "x", actorId: ACTOR_UID }), "admin"),
    ).resolves.toBe("SLUG_INVALID");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.FORUM_BOARD_SAVED },
      orderBy: { id: "desc" },
    });
    expect((audit.payloadJson as { created?: boolean }).created).toBe(true);
  });

  it("编辑:改名+排序;slug 可改且审计记 old/new", async () => {
    const board = await prisma.forumBoard.findUniqueOrThrow({ where: { slug: `admcrud-${RUN}` } });
    await updateBoard({
      id: board.id,
      slug: `admcrud2-${RUN}`,
      name: "CRUD 改名",
      sort: 8,
      actorId: ACTOR_UID,
    });
    const after = await prisma.forumBoard.findUniqueOrThrow({ where: { id: board.id } });
    expect(after.slug).toBe(`admcrud2-${RUN}`);
    expect(after.name).toBe("CRUD 改名");
    expect(after.sort).toBe(8);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.FORUM_BOARD_SAVED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({ oldSlug: `admcrud-${RUN}`, slug: `admcrud2-${RUN}` });
    await expect(
      errCode(updateBoard({ id: 9_999_999n, name: "x", actorId: ACTOR_UID }), "admin"),
    ).resolves.toBe("BOARD_NOT_FOUND");
  });

  it("删除:有主题拒绝;空版块可删且审计", async () => {
    await expect(errCode(deleteBoard({ id: boardAId, actorId: ACTOR_UID }), "admin")).resolves.toBe(
      "BOARD_HAS_THREADS",
    );
    const board = await prisma.forumBoard.findUniqueOrThrow({ where: { slug: `admcrud2-${RUN}` } });
    await deleteBoard({ id: board.id, actorId: ACTOR_UID });
    expect(await prisma.forumBoard.findUnique({ where: { id: board.id } })).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: ACTOR_UID, action: AUDIT_ACTION.FORUM_BOARD_DELETED },
      }),
    ).toBe(1);
  });

  it("listAdminBoards 含主题计数", async () => {
    const boards = await listAdminBoards();
    const mine = boards.find((b) => b.slug === `adm36a-${RUN}`);
    expect(mine?.threadCount).toBe(3);
  });
});
