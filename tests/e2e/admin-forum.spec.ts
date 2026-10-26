import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * M4 后台论坛管理 E2E:
 * ① 越权:legacyuser 访问 /admin/forum → middleware 重定向 /login?next=...;/api/admin/forum/* 403;
 * ② 管理闭环:m1admin 筛选 → 置顶/关闭/标签/删除落库+审计 → 回收站可见 → 恢复 → 前台可达。
 * fixture:RUN 前缀隔离直写(legacy WP ID 亦按 RUN 派生防撞),用后按前缀还原。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const RUN_NUM = Number.parseInt(RUN, 36);
const BOARD_SLUG = `e2eadmforum-${RUN}`;
const THREAD_TITLE = `E2E后台论坛主题 ${RUN}`;
const WP_TOPIC_ID = 9_970_000 + (RUN_NUM % 20_000);
const WP_POST_ID = 9_971_000 + (RUN_NUM % 20_000);
const ACTOR_NAME = "m1admin";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

let threadId = "";
let boardId = "";

test.beforeAll(async () => {
  const board = await prisma.forumBoard.create({
    data: { slug: BOARD_SLUG, name: "E2E后台版块", sort: 950 },
  });
  boardId = board.id.toString();
  const thread = await prisma.forumThread.create({
    data: {
      boardId: board.id,
      title: THREAD_TITLE,
      authorUserId: null,
      authorName: `e2e作者-${RUN}`,
      lastPostAt: new Date(),
      legacyWpTopicId: WP_TOPIC_ID,
    },
  });
  threadId = thread.id.toString();
  await prisma.forumPost.create({
    data: {
      threadId: thread.id,
      floor: 1,
      authorName: `e2e作者-${RUN}`,
      contentHtml: "<p>主贴</p>",
      legacyWpPostId: WP_POST_ID,
    },
  });
});

test.afterAll(async () => {
  // 前缀清理(含历史轮次自愈);MySQL JsonFilter 不支持 path 数组语法,审计取回后 JS 过滤
  const audits = await prisma.auditLog.findMany({
    where: { action: { startsWith: "forum_" } },
    select: { id: true, payloadJson: true },
  });
  const ids = audits
    .filter((a) => {
      const p = a.payloadJson as { threadId?: string; boardId?: string };
      return p.threadId === threadId || p.boardId === boardId;
    })
    .map((a) => a.id);
  if (ids.length) await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
  await prisma.forumPost.deleteMany({ where: { thread: { board: { slug: { startsWith: "e2eadmforum-" } } } } });
  await prisma.forumThread.deleteMany({ where: { board: { slug: { startsWith: "e2eadmforum-" } } } });
  await prisma.forumBoard.deleteMany({ where: { slug: { startsWith: "e2eadmforum-" } } });
  await prisma.$disconnect();
});

test("越权:普通用户访问后台论坛页重定向+API 403", async ({ page }) => {
  await login(page, "legacyuser", "oldpass123");
  await page.goto("/admin/forum");
  // middleware 浅校验先行:非 admin 一律引导回登录页(middleware.ts /admin 分支)
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fforum$/);
  // page.request 与浏览器上下文共享 cookie:带 legacyuser 会话才能命中 403(无会话是 401)
  const res = await page.request.post(`/api/admin/forum/threads/${threadId}`, {
    data: { action: "pin", pinned: true },
  });
  expect(res.status()).toBe(403);
});

test("管理闭环:置顶/关闭/标签/删除/回收站恢复 全落库+审计", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto(`/admin/forum?q=${encodeURIComponent(THREAD_TITLE)}`);
  const row = page.getByRole("row", { name: new RegExp(THREAD_TITLE) });
  await expect(row).toBeVisible();

  await page.on("dialog", (d) => d.accept());

  const pinBtn = row.getByRole("button", { name: "置顶", exact: true });
  await expect(pinBtn).toBeEnabled(); // hydration 同步点
  await pinBtn.click();
  await expect(row.getByRole("button", { name: "取消置顶" })).toBeEnabled(); // refresh 后态翻转
  await row.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(row.getByRole("button", { name: "开放" })).toBeEnabled();
  const labelSelect = row.getByLabel("状态标签");
  await expect(labelSelect).toBeEnabled();
  await labelSelect.selectOption("resolved");
  await expect(labelSelect).toHaveValue("resolved");

  let db = await prisma.forumThread.findUniqueOrThrow({ where: { id: BigInt(threadId) } });
  expect(db.pinned).toBe(true);
  expect(db.closedAt).not.toBeNull();
  expect(db.statusLabel).toBe("resolved");

  await row.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("没有匹配的主题。")).toBeVisible(); // 默认视图过滤软删

  await page.goto(`/admin/forum?q=${encodeURIComponent(THREAD_TITLE)}&deleted=1`);
  const trashRow = page.getByRole("row", { name: new RegExp(THREAD_TITLE) });
  await expect(trashRow).toBeVisible();
  const restoreBtn = trashRow.getByRole("button", { name: "恢复" });
  await expect(restoreBtn).toBeEnabled();
  await restoreBtn.click();
  await expect(page.getByText("没有匹配的主题。")).toBeVisible(); // 恢复后退出回收站视图

  db = await prisma.forumThread.findUniqueOrThrow({ where: { id: BigInt(threadId) } });
  expect(db.deletedAt).toBeNull();

  const audits = await prisma.auditLog.findMany({
    where: { action: { startsWith: "forum_thread_" } },
    select: { action: true, payloadJson: true },
  });
  const mine = audits.filter((a) => (a.payloadJson as { threadId?: string }).threadId === threadId);
  expect(new Set(mine.map((a) => a.action))).toEqual(
    new Set(["forum_thread_pin", "forum_thread_close", "forum_thread_label", "forum_thread_delete", "forum_thread_undelete"]),
  );

  // 前台可达(恢复后浏览层可见)
  await page.goto(`/forum/thread/${threadId}`);
  await expect(page.getByText(THREAD_TITLE)).toBeVisible();
});
