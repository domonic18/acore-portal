import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";

/**
 * T041 US5 论坛 E2E(quickstart S4;SC-201/207):
 * ① 游客三层浏览:版块列表 → 主题列表(置顶/净标题) → 楼层阅读(未映射作者快照)+viewCount+1;
 * ② 版主 API 越权:游客 401;user 403 + forum_moderation_violation 审计;
 * ③ moderator 操作全链路(独立隔离主题):置顶/标签/关闭/重开/软删 → 徽标联动 + 审计落库;
 * ④ moderator 访问 /admin:被 edge middleware 拦回 /login?next(与 T034 口径一致;
 *    quickstart 记 403 系 API 语义,页面层实际是 302,admin API 仍 403 已一并断言);
 * ⑤ /bbs 与 ?topic=/?forum= 301 兼容(route_map 种子键)。
 * fixture:RUN 隔离直写(独立版块+主题),版主链路不碰种子主题;用后全清。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const BOARD_SLUG = `e2eforum-${RUN}`;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function redirectTarget(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  const loc = res.headers().location;
  return { res, target: loc ? new URL(loc, "http://localhost").pathname : null };
}

let boardId = 0n;
let threadId = 0n;

test.beforeAll(async () => {
  const board = await prisma.forumBoard.create({
    data: {
      slug: BOARD_SLUG,
      name: `E2E 版主版块 ${RUN}`,
      sort: 99,
      legacyWpForumId: 9_950_000,
    },
  });
  boardId = board.id;
  const moderator = await prisma.user.findUniqueOrThrow({
    where: { username: "m3moderator" },
    select: { id: true },
  });
  const thread = await prisma.forumThread.create({
    data: {
      boardId: board.id,
      title: `E2E 版主链路主题 ${RUN}`,
      authorUserId: moderator.id,
      authorName: "m3moderator",
      lastPostAt: new Date(),
      legacyWpTopicId: 9_951_000,
    },
  });
  threadId = thread.id;
  await prisma.forumPost.create({
    data: {
      threadId: thread.id,
      floor: 1,
      authorUserId: moderator.id,
      authorName: "m3moderator",
      contentHtml: "<p>E2E 主贴正文</p>",
      legacyWpPostId: 9_952_000,
    },
  });
});

test.afterAll(async () => {
  // 本 run 相关审计(版主四操作按 actor;越权审计按动作+时间窗;MySQL 无 Json path 过滤)
  const runStart = new Date(Date.now() - 30 * 60_000);
  const moderator = await prisma.user.findUniqueOrThrow({
    where: { username: "m3moderator" },
    select: { id: true },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        {
          actorUserId: moderator.id,
          action: {
            in: [
              AUDIT_ACTION.FORUM_THREAD_PIN,
              AUDIT_ACTION.FORUM_THREAD_CLOSE,
              AUDIT_ACTION.FORUM_THREAD_LABEL,
              AUDIT_ACTION.FORUM_THREAD_DELETE,
            ],
          },
        },
        {
          action: AUDIT_ACTION.FORUM_MODERATION_VIOLATION,
          createdAt: { gte: runStart },
        },
      ],
    },
  });
  await prisma.forumPost.deleteMany({ where: { threadId } });
  await prisma.forumThread.deleteMany({ where: { boardId } });
  await prisma.forumBoard.deleteMany({ where: { id: boardId } });
  await prisma.$disconnect();
});

test.describe("US5 论坛(T041)", () => {
  test("游客三层浏览:版块 → 主题列表 → 楼层(未映射作者快照)+浏览计数(FR-219/R2)", async ({
    page,
  }) => {
    const seedThread = await prisma.forumThread.findUniqueOrThrow({
      where: { legacyWpTopicId: 2002 },
      select: { id: true, viewCount: true },
    });

    await page.goto("/forum");
    await expect(page.getByRole("heading", { name: "论坛" })).toBeVisible();
    await expect(page.getByText("公会大厅")).toBeVisible();
    await expect(page.getByText("交易行")).toBeVisible();

    await page.goto("/forum/guild-hall");
    // 置顶主题在列 + 置顶徽标;2002 呈现剥标签后的净标题
    await expect(page.getByText("置顶")).toBeVisible();
    await expect(page.getByText("公会招收稳定成员")).toBeVisible();
    await expect(page.getByText("附魔材料求购")).toBeVisible();

    await page.goto(`/forum/thread/${seedThread.id}`);
    // 未映射作者快照行(authorUserId=null 仅 authorName)
    await expect(page.getByText("已注销老玩家").first()).toBeVisible();
    await expect(page.getByText("楼主")).toBeVisible();
    await expect(page.getByText("2 楼")).toBeVisible();
    await expect(page.getByText("路人甲")).toBeVisible();

    const after = await prisma.forumThread.findUniqueOrThrow({
      where: { id: seedThread.id },
      select: { viewCount: true },
    });
    expect(after.viewCount).toBe(seedThread.viewCount + 1);
  });

  test("版主 API 越权:游客 401;user 403+审计(SC-207)", async ({ page, request }) => {
    const guest = await request.post(`/api/forum/moderate/thread/${threadId}/pin`, {
      data: { pinned: true },
    });
    expect(guest.status()).toBe(401);

    await login(page, "legacyuser", "oldpass123");
    const res = await page.request.post(`/api/forum/moderate/thread/${threadId}/pin`, {
      data: { pinned: true },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");

    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const violation = await prisma.auditLog.findFirstOrThrow({
      where: {
        actorUserId: legacy.id,
        action: AUDIT_ACTION.FORUM_MODERATION_VIOLATION,
        category: AUDIT_CATEGORY.FORUM,
      },
      orderBy: { id: "desc" },
    });
    expect((violation.payloadJson as { surface?: string }).surface).toBe("api");
  });

  test("moderator 操作全链路:置顶/标签/关闭/重开/软删 + 审计(FR-220)", async ({ page }) => {
    await login(page, "m3moderator", "moderatorpass123");
    await page.goto(`/forum/thread/${threadId}`);
    await expect(page.getByText("版主操作")).toBeVisible();

    // 置顶 → 按钮翻面 + 页头徽标
    await page.getByRole("button", { name: "置顶", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消置顶" })).toBeVisible();
    await expect(page.getByText("置顶", { exact: true }).first()).toBeVisible();

    // 标签流转 → 【已解决】徽标
    await page.getByLabel("状态标签").selectOption("resolved");
    await expect(page.getByText("【已解决】")).toBeVisible();

    // 关闭 → 已关闭徽标 + 标签选择禁用(双表达以 closedAt 为准)
    await page.getByRole("button", { name: "关闭主题" }).click();
    await expect(page.getByText("【已关闭】")).toBeVisible();
    await expect(page.getByLabel("状态标签")).toBeDisabled();

    // 重开 → 双清(标签回 none)
    await page.getByRole("button", { name: "重开主题" }).click();
    await expect(page.getByText("【已关闭】")).toBeHidden();

    // 软删 → 回版块列表且主题不再可见;库内数据保留
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "删除" }).click();
    await expect(page).toHaveURL(new RegExp(`/forum/${BOARD_SLUG}$`));
    await expect(page.getByText(`E2E 版主链路主题 ${RUN}`)).toBeHidden();

    const softDeleted = await prisma.forumThread.findUniqueOrThrow({
      where: { id: threadId },
      select: { deletedAt: true },
    });
    expect(softDeleted.deletedAt).not.toBeNull();

    const moderator = await prisma.user.findUniqueOrThrow({
      where: { username: "m3moderator" },
      select: { id: true },
    });
    const audits = await prisma.auditLog.findMany({
      where: {
        actorUserId: moderator.id,
        action: {
          in: [
            "forum_thread_pin",
            "forum_thread_close",
            "forum_thread_label",
            "forum_thread_delete",
          ],
        },
      },
      select: { action: true },
    });
    const actions = audits.map((a) => a.action).sort();
    // 关闭+重开各记一条 close 审计
    expect(actions).toEqual([
      "forum_thread_close",
      "forum_thread_close",
      "forum_thread_delete",
      "forum_thread_label",
      "forum_thread_pin",
    ]);
  });

  test("moderator 访问后台:页面被 edge 拦回登录页,admin API 403(R5)", async ({ page }) => {
    await login(page, "m3moderator", "moderatorpass123");
    await page.goto("/admin");
    // edge 层先拦(role!=admin → /login?next);RSC 深校验归集成测试
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);

    const api = await page.request.get("/api/admin/articles");
    expect(api.status()).toBe(403);
  });

  test("/bbs 与 ?topic=/?forum= 301 兼容(FR-219/M3)", async ({ request }) => {
    const bbs = await redirectTarget(request, "/bbs");
    expect(bbs.res.status()).toBe(301);
    expect(bbs.target).toBe("/forum");

    const seedThread = await prisma.forumThread.findUniqueOrThrow({
      where: { legacyWpTopicId: 2001 },
      select: { id: true },
    });
    const topic = await redirectTarget(request, "/?topic=2001");
    expect(topic.res.status()).toBe(301);
    expect(topic.target).toBe(`/forum/thread/${seedThread.id}`);

    // /bbs/ 带尾斜杠先被 Next 归一化 308(查询串保留),落回 /bbs 后再走 route_map
    const bbsSlash = await redirectTarget(request, "/bbs/?topic=2001");
    expect(bbsSlash.res.status()).toBe(308);
    expect(bbsSlash.target).toBe("/bbs");
    const bbsTopic = await redirectTarget(request, "/bbs?topic=2001");
    expect(bbsTopic.res.status()).toBe(301);
    expect(bbsTopic.target).toBe(`/forum/thread/${seedThread.id}`);

    const forum = await redirectTarget(request, "/?forum=1000");
    expect(forum.res.status()).toBe(301);
    expect(forum.target).toBe("/forum/guild-hall");
  });
});
