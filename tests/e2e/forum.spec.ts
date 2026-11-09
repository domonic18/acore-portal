import path from "node:path";
import { unlink } from "node:fs/promises";
import Redis from "ioredis";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";
import { resolveE2ERedisUrl } from "./redis-url";

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
const POST_BOARD_SLUG = `e2epost-${RUN}`;
const PNG_1PX = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
// 发帖/回帖/上传频控 key 清理(E2E 连发会撞 429;spec 进程直连 dev redis)
const redis = new Redis(resolveE2ERedisUrl());

async function clearForumRateLimits() {
  const patterns = [
    "rl:forum-thread-fast:*",
    "rl:forum-thread-hour:*",
    "rl:forum-post-fast:*",
    "rl:forum-post-hour:*",
    "rl:forum-upload:*",
  ];
  for (const pattern of patterns) {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  }
}

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
let runStart: Date;

test.beforeAll(async () => {
  runStart = new Date(Date.now() - 60_000);
  // 幂等:清可能的上轮残留(legacyWpForumId 固定值,崩溃 run 的 afterAll 可能未清)
  const stale = await prisma.forumBoard.findMany({
    where: { legacyWpForumId: { in: [9_950_000] } },
    select: { id: true },
  });
  for (const b of stale) {
    await prisma.forumPost.deleteMany({ where: { thread: { boardId: b.id } } });
    await prisma.forumThread.deleteMany({ where: { boardId: b.id } });
    await prisma.forumBoard.delete({ where: { id: b.id } });
  }
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
      contentHtml:
        "<p>E2E 主贴正文</p>\n<blockquote><strong>标题：</strong>内容一\n\n<strong>说明：</strong>内容二</blockquote>",
      legacyWpPostId: 9_952_000,
    },
  });
});

test.afterAll(async () => {
  await clearForumRateLimits();
  redis.disconnect();
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
          createdAt: { gte: runStart },
          action: {
            in: [
              AUDIT_ACTION.FORUM_THREAD_PIN,
              AUDIT_ACTION.FORUM_THREAD_CLOSE,
              AUDIT_ACTION.FORUM_THREAD_LABEL,
              AUDIT_ACTION.FORUM_THREAD_DELETE,
              AUDIT_ACTION.FORUM_POST_DELETED,
              AUDIT_ACTION.FORUM_THREAD_CREATED,
              AUDIT_ACTION.FORUM_POST_CREATED,
            ],
          },
        },
        {
          action: AUDIT_ACTION.FORUM_MODERATION_VIOLATION,
          createdAt: { gte: runStart },
        },
        {
          action: AUDIT_ACTION.FORUM_MODERATION_VIOLATION,
          createdAt: { gte: runStart },
        },
        {
          action: {
            in: [
              AUDIT_ACTION.FORUM_THREAD_CREATED,
              AUDIT_ACTION.FORUM_POST_CREATED,
              AUDIT_ACTION.FORUM_POST_DELETED,
            ],
          },
          createdAt: { gte: runStart },
        },
      ],
    },
  });
  // 发帖回帖 fixtures(#34):版块/主题/楼层/上传资产
  const uploadAssets = await prisma.mediaAsset.findMany({
    where: { originalName: "e2e-forum-upload.png" },
    select: { id: true },
  });
  await prisma.mediaAsset.deleteMany({ where: { originalName: "e2e-forum-upload.png" } });
  await prisma.forumPost.deleteMany({
    where: { thread: { board: { slug: { in: [BOARD_SLUG, POST_BOARD_SLUG] } } } },
  });
  await prisma.forumThread.deleteMany({
    where: { board: { slug: { in: [BOARD_SLUG, POST_BOARD_SLUG] } } },
  });
  await prisma.forumBoard.deleteMany({
    where: { slug: { in: [BOARD_SLUG, POST_BOARD_SLUG] } },
  });
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
    // 版块名同时出现在右栏最新主题,按精确链接文本定位避免 strict mode 冲突
    await expect(page.getByRole("link", { name: "公会大厅", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "交易行", exact: true })).toBeVisible();

    await page.goto("/forum/guild-hall");
    // 置顶主题在列 + 置顶徽标(分区标题「置顶公告」也会匹配,取精确徽标文本)
    await expect(page.getByText("置顶", { exact: true }).first()).toBeVisible();
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

  test("存量帖正文换行还原:裸换行渲染为分行,不再坨成一段(wpautop 口径)", async ({
    page,
  }) => {
    await page.goto(`/forum/thread/${threadId}`);
    const quote = page.locator("blockquote").filter({ hasText: "标题：" });
    await expect(quote).toBeVisible();
    // 双换行 = 空行:裸 \n 无 <br> 时浏览器折叠成空格,两段文字会连排成一坨
    const text = await quote.innerText();
    expect(text).toMatch(/内容一\s*\n+\s*说明：/s);
    await expect(page.getByText("E2E 主贴正文")).toBeVisible();
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
    // exact:新版编辑器工具栏「删除线」按钮与「删除」子串冲突(strict mode)
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "删除", exact: true }).click();
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
        createdAt: { gte: runStart },
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

  test("p07 页壳:版块两栏/分区置顶/数字分页/只读说明", async ({ page }) => {
    await page.goto("/forum");
    await expect(page.getByRole("heading", { name: /版块（/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "最新主题" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "版规与说明" })).toBeVisible();
    // #57:板块列表不再混排「最新动态」列(最新主题只在右栏)
    await expect(page.getByText("最新动态", { exact: true })).toHaveCount(0);
    // 板块说明换行+链接渲染(#59 数据修复后说明为 markdown 形态)
    await expect(page.getByTestId("board-desc-guild-hall").locator("br")).toHaveCount(1);
    await expect(
      page.getByTestId("board-desc-trade").getByRole("link", { name: "交易安全须知" }),
    ).toHaveAttribute("href", "/?p=169");

    const seed = await prisma.forumThread.findUniqueOrThrow({
      where: { legacyWpTopicId: 2002 },
      select: { id: true, board: { select: { slug: true } } },
    });
    await page.goto(`/forum/${seed.board.slug}`);
    await expect(page.getByRole("heading", { name: "置顶公告" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "全部主题" })).toBeVisible();
    await expect(page.getByText(/共 \d+ 个主题 · 第 1 \/ \d+ 页/)).toBeVisible();

    await page.goto(`/forum/thread/${seed.id}`);
    // 游客态:只读说明已替换为登录引导(#34)
    await expect(page.getByText("后可回帖;游客仅可浏览。")).toBeVisible();
  });

  // 用户反馈:版规与说明置于最新主题上方,最近回复置于最新主题下方
  test("右栏顺序:版规与说明 ▲ 最新主题 ▲ 最近回复(垂直堆叠)", async ({ page }) => {
    await page.goto("/forum");
    await expect(page.getByRole("heading", { name: "版规与说明" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "最新主题" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "最近回复" })).toBeVisible();

    const yOf = (name: string) =>
      page
        .getByRole("heading", { name })
        .evaluate((el) => el.getBoundingClientRect().top);
    const yRules = await yOf("版规与说明");
    const yLatest = await yOf("最新主题");
    const yReplies = await yOf("最近回复");
    // 垂直顺序:版规(上) → 最新主题(中) → 最近回复(下)
    expect(yRules).toBeLessThan(yLatest);
    expect(yLatest).toBeLessThan(yReplies);

    // 最近回复带主题链接(种子库含存量回帖)
    await expect(
      page.getByTestId("forum-recent-replies").locator('a[href^="/forum/thread/"]').first(),
    ).toBeVisible();
  });

  // 用户反馈 2026-11-01:版块页/主题页顶部(面包屑+标题+元信息)直压站点背景图,缺区域底色
  test("版块页与主题页顶部有内容区底色面板", async ({ page }) => {
    const seed = await prisma.forumThread.findUniqueOrThrow({
      where: { legacyWpTopicId: 2002 },
      select: { id: true, board: { select: { slug: true } } },
    });

    for (const path of [`/forum/${seed.board.slug}`, `/forum/thread/${seed.id}`]) {
      await page.goto(path);
      const panel = page.getByTestId("content-panel").first();
      await expect(panel).toBeVisible();
      const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    }
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

test.describe("发帖回帖(#34 2026-11-04;编辑器 vditor IR 升级 2026-11-09)", () => {
  const THREAD_TITLE = `E2E 发帖主题 ${RUN}`;
  const REPLY_BODY = `E2E 回帖内容 ${RUN}`;
  const CLOSED_TITLE = `E2E 关闭主题 ${RUN}`;
  let closedThreadId = 0n;
  let flowThreadId = 0n;

  function login(page: Page, username: string, password: string) {
    return (async () => {
      await page.goto("/login");
      await page.getByLabel("用户名").fill(username);
      await page.getByLabel("密码", { exact: true }).fill(password);
      await page.getByRole("button", { name: "登录" }).click();
      await expect(page).toHaveURL(/\/account\/overview$/);
    })();
  }

  /**
   * vditor IR 编辑器填写:水合前是 textarea 兜底,水合后挂 contenteditable(pre.vditor-reset)。
   * 键入走 keyboard.insertText(fill() 的 execCommand 路径会与 vditor 内部态失同步);
   * vditor IR 对单次 insertText 的整段不做块内重渲染(上游行为),末尾补一次按键触发
   * Spin(立即渲染 **加粗** 等),Backspace 撤掉该按键的副作用。
   */
  async function fillComposer(page: Page, text: string) {
    const editor = page.locator('[data-testid="forum-composer"] .vditor-ir pre.vditor-reset');
    await expect(editor).toBeVisible({ timeout: 10_000 });
    await editor.click();
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.insertText(lines[i]);
      if (i < lines.length - 1) await page.keyboard.press("Enter");
    }
    await page.keyboard.press("Enter");
    await page.keyboard.press("Backspace");
  }

  test.beforeEach(async () => {
    await clearForumRateLimits();
  });

  test.beforeAll(async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const board = await prisma.forumBoard.create({
      data: { slug: POST_BOARD_SLUG, name: `E2E 发帖版块 ${RUN}`, sort: 97 },
    });
    // 已关闭主题(测 409 与游客/用户双态提示)
    const closed = await prisma.forumThread.create({
      data: {
        boardId: board.id,
        title: CLOSED_TITLE,
        authorUserId: user.id,
        authorName: "legacyuser",
        closedAt: new Date(),
        lastPostAt: new Date(),
      },
    });
    closedThreadId = closed.id;
    await clearForumRateLimits();
  });

  test.afterAll(async () => {
    // 清理 describe 级 fixtures(media/文件/频控);redis 与 prisma 连接由文件级 afterAll 统一断开
    const assets = await prisma.mediaAsset.findMany({
      where: { originalName: "e2e-forum-upload.png" },
      select: { id: true, cosKey: true },
    });
    await prisma.mediaAsset.deleteMany({ where: { originalName: "e2e-forum-upload.png" } });
    for (const row of assets) {
      await unlink(path.join(process.cwd(), "workspace", "uploads", row.cosKey)).catch(() => {});
    }
    await clearForumRateLimits();
  });

  test("游客:版块页无发帖按钮,发帖/回帖 API 401", async ({ page, request }) => {
    await page.goto(`/forum/${POST_BOARD_SLUG}`);
    await expect(page.getByRole("link", { name: "登录后可发帖" })).toBeVisible();
    await expect(page.getByRole("link", { name: "发帖", exact: true })).toHaveCount(0);

    const t = await request.post("/api/forum/threads", {
      data: { boardSlug: POST_BOARD_SLUG, title: "x", content: "yy" },
    });
    expect(t.status()).toBe(401);
    const r = await request.post(`/api/forum/threads/1/posts`, { data: { content: "yy" } });
    expect(r.status()).toBe(401);
  });

  test("编辑器工具栏:加粗/色板组可见,色板展开受限 6 色(编辑器升级,#99 口径更新)", async ({
    page,
  }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/${POST_BOARD_SLUG}/new`);
    const composer = page.getByTestId("forum-composer");
    await expect(composer.locator('.vditor-toolbar button[data-type="bold"]')).toBeVisible();
    await expect(
      composer.locator('.vditor-toolbar button[data-type="forum-color"]'),
    ).toBeVisible();
    await composer.locator('.vditor-toolbar button[data-type="forum-color"]').click();
    for (const key of ["red", "orange", "gold", "green", "blue", "purple"]) {
      await expect(composer.locator(`button[data-type="forum-c-${key}"]`)).toBeVisible();
    }
  });

  test("legacyuser 发主题全链路:表单→主题页(楼层1 Markdown 渲染)→版块列表可见", async ({
    page,
  }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/${POST_BOARD_SLUG}`);
    await expect(page.getByRole("link", { name: "发帖", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "发帖", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/forum/${POST_BOARD_SLUG}/new$`));
    await page.getByLabel(/标题/).fill(THREAD_TITLE);
    await fillComposer(page, "欢迎来到**发帖测试**主题。\n\n第二段内容。");
    await page.getByRole("button", { name: "发布主题" }).click();

    await expect(page).toHaveURL(/\/forum\/thread\/\d+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: THREAD_TITLE })).toBeVisible();
    // 楼层1 Markdown 渲染:<strong> 加粗
    await expect(page.getByRole("strong")).toContainText("发帖测试");
    await expect(page.getByText("楼主")).toBeVisible();

    const thread = await prisma.forumThread.findFirstOrThrow({
      where: { title: THREAD_TITLE },
      select: { id: true, replyCount: true },
    });
    flowThreadId = thread.id;
    expect(thread.replyCount).toBe(0); // 主贴不计回帖
    const floor1 = await prisma.forumPost.findFirstOrThrow({
      where: { threadId: thread.id },
      select: { floor: true, contentHtml: true, legacyWpPostId: true },
    });
    expect(floor1.floor).toBe(1);
    expect(floor1.legacyWpPostId).toBeNull();
    expect(floor1.contentHtml).toContain("**发帖测试**");

    // 版块列表可见
    await page.goto(`/forum/${POST_BOARD_SLUG}`);
    await expect(page.getByText(THREAD_TITLE).first()).toBeVisible();
  });

  test("回帖:legacyuser 回复 → 楼层 2 + replyCount=1 + 审计", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/thread/${flowThreadId}`);
    await fillComposer(page, REPLY_BODY);
    await page.getByRole("button", { name: "回复", exact: true }).click();
    // 先等 UI 反馈(POST 完成),再查 DB
    await expect(page.getByText(`回帖成功,已发布到第 2 楼。`)).toBeVisible();

    const reply = await prisma.forumPost.findFirstOrThrow({
      where: { threadId: flowThreadId, floor: 2 },
      select: { authorName: true },
    });
    expect(reply.authorName).toBe("legacyuser");
    const thread = await prisma.forumThread.findUniqueOrThrow({
      where: { id: flowThreadId },
      select: { replyCount: true },
    });
    expect(thread.replyCount).toBe(1);
    const audits = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.FORUM_POST_CREATED },
      orderBy: { id: "desc" },
    });
    expect(
      (audits.payloadJson as { threadId?: string }).threadId,
    ).toBe(flowThreadId.toString());
  });

  test("上传图片:上传→插入 Markdown→发布后图片回显(/uploads 本地回退)", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/${POST_BOARD_SLUG}/new`);
    await page.getByLabel(/标题/).fill(`E2E 上传图片主题 ${RUN}`);
    const composer = page.getByTestId("forum-composer");
    // vditor 上传项是 div[data-type=upload] 内嵌 input(非 button),直接对 input 派发
    await composer
      .locator('[data-type="upload"] input[type=file]')
      .setInputFiles([
        { name: "e2e-forum-upload.png", mimeType: "image/png", buffer: Buffer.from(PNG_1PX) },
      ]);
    // handler 接管上传后 insertValue 插入 markdown,IR 区即时渲染图片
    await expect(composer.locator('.vditor-ir img[src^="/uploads/"]')).toBeVisible();
    await page.getByRole("button", { name: "发布主题" }).click();
    await expect(page).toHaveURL(/\/forum\/thread\/\d+$/, { timeout: 15_000 });

    const img = page.locator("main img[src^='/uploads/']").first();
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    const res = await page.request.get(src!);
    expect(res.status()).toBe(200);
  });

  test("受限色板:选中文字上色→发布后帖内 span.c-red 着色(编辑器升级)", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/${POST_BOARD_SLUG}/new`);
    await page.getByLabel(/标题/).fill(`E2E 色板主题 ${RUN}`);
    await fillComposer(page, "重点内容");
    // 选中整行 → 工具栏色板 → 红
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    const composer = page.getByTestId("forum-composer");
    await composer.locator('.vditor-toolbar button[data-type="forum-color"]').click();
    await composer.locator('button[data-type="forum-c-red"]').click();
    // 编辑区代码层落入类标记,retag 预览层实时着色(所见即所得;
    // 包裹层 textContent 含隐藏标记源码,文字断言只看发布后帖内)
    await expect(composer.locator(".vditor-ir")).toContainText('class="c-red"');
    await expect(composer.locator('.vditor-ir [data-palette="red"]')).toHaveCSS(
      "color",
      "rgb(248, 113, 113)",
    );
    await page.getByRole("button", { name: "发布主题" }).click();
    await expect(page).toHaveURL(/\/forum\/thread\/\d+$/, { timeout: 15_000 });

    const colored = page.locator("main .forum-post-body span.c-red").first();
    await expect(colored).toHaveText("重点内容");
    await expect(colored).toHaveCSS("color", "rgb(248, 113, 113)");
  });

  test("频控:60s 内第二篇主题 429(beforeAll 已清频控)", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    const payload = {
      boardSlug: POST_BOARD_SLUG,
      title: `E2E 频控第一篇 ${RUN}`,
      content: "频控验证第一篇",
    };
    const first = await page.request.post("/api/forum/threads", { data: payload });
    expect(first.status()).toBe(200);
    const second = await page.request.post("/api/forum/threads", {
      data: { ...payload, title: `E2E 频控第二篇 ${RUN}` },
    });
    expect(second.status()).toBe(429);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });

  test("关闭主题:页面提示不渲染回帖表单,API 409", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto(`/forum/thread/${closedThreadId}`);
    await expect(page.getByText("主题已关闭,不再接受回帖")).toBeVisible();
    await expect(page.getByRole("button", { name: "回复", exact: true })).toHaveCount(0);

    const res = await page.request.post(`/api/forum/threads/${closedThreadId}/posts`, {
      data: { content: "试试回帖" },
    });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("THREAD_CLOSED");
  });

  test("版主删楼层:软删+replyCount 回减+审计(theme 表 single-line 断言顺带)", async ({ page }) => {
    // 前置:flowThread 里已有 legacyuser 的 2 楼
    await login(page, "m3moderator", "moderatorpass123");
    await page.goto(`/forum/thread/${flowThreadId}`);
    await expect(page.getByText("2 楼").first()).toBeVisible();
    const floorArticle = page.locator("article", { hasText: "2 楼" });
    await page.once("dialog", (d) => d.accept());
    await floorArticle.getByRole("button", { name: "删除楼层" }).click();
    // 软删成功后 refresh 使楼层消失(先等 UI,再查 DB)
    await expect(floorArticle).toHaveCount(0);

    const gone = await prisma.forumPost.findFirst({
      where: { threadId: flowThreadId, floor: 2, deletedAt: null },
    });
    expect(gone).toBeNull();
    const thread = await prisma.forumThread.findUniqueOrThrow({
      where: { id: flowThreadId },
      select: { replyCount: true },
    });
    expect(thread.replyCount).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.FORUM_POST_DELETED },
      orderBy: { id: "desc" },
    });
    expect((audit.payloadJson as { threadId?: string }).threadId).toBe(flowThreadId.toString());
  });
});
