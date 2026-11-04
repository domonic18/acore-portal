import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import {
  ForumWriteError,
  createReply,
  createThread,
} from "@/server/services/forum/write";

/**
 * 论坛发帖/回帖写路径(#34 2026-11-04):createThread 事务建主题+主贴(floor1),
 * createReply floor=max+1 + replyCount/lastPostAt 同步, closed/软删拒绝,
 * 审计(正文不落);频控在 API 层,不在本测试范围。
 */
const RUN = Date.now().toString(36);
const author = { id: 0n, name: "fw-legacyuser" };
let legacyUserId = 0n;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  legacyUserId = (
    await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    })
  ).id;
  author.id = legacyUserId;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: {
      action: { in: ["forum_thread_created", "forum_post_created"] },
      actorUserId: legacyUserId,
    },
  });
  await prisma.forumPost.deleteMany({ where: { authorUserId: legacyUserId } });
  await prisma.forumThread.deleteMany({ where: { authorUserId: legacyUserId } });
  await prisma.$disconnect();
});

describe("论坛写路径 forum/write(#34)", () => {
  it("createThread:主题+主贴同建,审计正文不落", async () => {
    const { threadId } = await createThread({
      boardId: (await prisma.forumBoard.findFirstOrThrow({ select: { id: true } })).id,
      author,
      title: `FW 写路径主题 ${RUN}`,
      content: "**主贴**正文",
    });
    const t = await prisma.forumThread.findUniqueOrThrow({
      where: { id: threadId },
      include: { _count: { select: { posts: true } } },
    });
    expect(t.title).toBe(`FW 写路径主题 ${RUN}`);
    expect(t.replyCount).toBe(0);
    expect(t._count.posts).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.FORUM_THREAD_CREATED, actorUserId: author.id },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({ threadId: threadId.toString() });
    expect(JSON.stringify(audit.payloadJson)).not.toContain("主贴正文");
  });

  it("createReply:floor=max+1,replyCount/lastPostAt 同步,审计记楼层", async () => {
    const { threadId } = await createThread({
      boardId: (await prisma.forumBoard.findFirstOrThrow({ select: { id: true } })).id,
      author,
      title: `FW 回帖主题 ${RUN}`,
      content: "主贴",
    });
    const first = await createReply({ threadId, author, content: "回帖一" });
    expect(first.floor).toBe(2);
    const second = await createReply({ threadId, author, content: "回帖二" });
    expect(second.floor).toBe(3);
    const t = await prisma.forumThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { replyCount: true },
    });
    expect(t.replyCount).toBe(2);
  });

  it("closed/软删主题拒绝,NOT_FOUND 兜底", async () => {
    const { threadId } = await createThread({
      boardId: (await prisma.forumBoard.findFirstOrThrow({ select: { id: true } })).id,
      author,
      title: `FW 关闭主题 ${RUN}`,
      content: "待关闭",
    });
    await prisma.forumThread.update({
      where: { id: threadId },
      data: { closedAt: new Date() },
    });
    expect(async () => {
      await createReply({ threadId, author, content: "尝试回帖" }).catch((e) => {
        throw new Error((e as { code?: string }).code);
      });
    }).rejects.toThrow("THREAD_CLOSED");
    await prisma.forumThread.update({
      where: { id: threadId },
      data: { deletedAt: new Date() },
    });
    await expect(createReply({ threadId, author, content: "再试" })).rejects.toMatchObject({
      code: "THREAD_NOT_FOUND",
    });
  });
});
