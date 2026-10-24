import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T034 US4 内容后台 E2E(quickstart S4,SC-206):
 * ① 发文闭环:m1admin 后台发文(MD 含表格+代码块+图片)→ 预览即所见 → 前台
 *   渲染全对(表格/高亮块/白名单图片/TOC)+归档可见;
 * ② 草稿:保存后前台 404+归档不可见;
 * ③ 越权:moderator 访问 /admin/articles 被 middleware 拦回登录页(RSC 深校验归集成),
 *   POST /api/admin/articles 403(admin_access_violation 由集成测试回归)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `e2eart-`;
const ART_SLUG = `${SLUG_PREFIX}pub-${RUN}`;
const ART_TITLE = `E2E 发文闭环 ${RUN}`;
const DRAFT_SLUG = `${SLUG_PREFIX}draft-${RUN}`;
const DRAFT_TITLE = `E2E 草稿不可见 ${RUN}`;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function createArticle(
  page: Page,
  input: { title: string; slug: string; bodyMd: string; status: "draft" | "published" },
) {
  await page.goto("/admin/articles/new");
  await page.getByLabel("标题", { exact: true }).fill(input.title);
  await page.getByLabel(/别名 slug/).fill(input.slug);
  await page.getByPlaceholder(/正文 Markdown/).fill(input.bodyMd);
  // 非 exact:label 包裹 select,textContent 含 option 文案
  await page.getByLabel("状态").selectOption(input.status);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);
}

const PUB_MD = [
  "## 开放安排",
  "",
  "| 阶段 | 状态 |",
  "| --- | --- |",
  "| 第一阶段 | 已开放 |",
  "",
  "```ts",
  "console.log('hello lokta');",
  "```",
  "",
  "![测试图片](/images/legacy-missing.svg)",
].join("\n");

test.afterAll(async () => {
  await prisma.articleTag.deleteMany({ where: { article: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.article.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  // Prisma JSON path 过滤受限:应用层筛出本 spec 产生的越权审计行再按 id 清
  const moderator = await prisma.user.findUnique({
    where: { username: "m3moderator" },
    select: { id: true },
  });
  if (moderator) {
    const audits = await prisma.auditLog.findMany({
      where: { action: "admin_access_violation", actorUserId: moderator.id },
      select: { id: true, payloadJson: true },
    });
    const ids = audits
      .filter((a) => (a.payloadJson as { path?: string } | null)?.path === "/api/admin/articles")
      .map((a) => a.id);
    if (ids.length > 0) {
      await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
    }
  }
  await prisma.$disconnect();
});

test.describe("发文闭环(T034 SC-206)", () => {
  test("后台发文(MD 表格+代码块+图片)→ 前台渲染全对+归档可见", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    // ADMIN_NAV 内容域入口可达(T032;header 导航与页面主链同名,取首个)
    await page.goto("/admin");
    await expect(page.getByRole("link", { name: "文章" }).first()).toBeVisible();

    await page.goto("/admin/articles/new");
    await page.getByLabel("标题", { exact: true }).fill(ART_TITLE);
    await page.getByLabel(/别名 slug/).fill(ART_SLUG);
    await page.getByPlaceholder(/正文 Markdown/).fill(PUB_MD);
    // 预览即所见(FR-215):同管线,表格在预览可见
    await page.getByRole("button", { name: "预览" }).click();
    await expect(page.getByTestId("markdown-preview")).toContainText("第一阶段");
    await page.getByLabel("状态").selectOption("published");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/admin\/articles$/);

    // 前台渲染(SC-206:表格/代码块/图片/TOC 全对)
    await page.goto(`/post/${ART_SLUG}`);
    await expect(page.getByRole("heading", { name: ART_TITLE })).toBeVisible();
    await expect(page.getByRole("cell", { name: "第一阶段" })).toBeVisible();
    await expect(page.locator("article pre")).toContainText("console.log('hello lokta')");
    await expect(page.locator("article img")).toHaveAttribute(
      "src",
      "/images/legacy-missing.svg",
    );
    const toc = page.getByRole("navigation", { name: "目录" });
    await expect(toc).toContainText("开放安排");

    // 归档可见(.first():标题同时出现在归档列表与侧栏公告位)
    await page.goto("/announcements");
    await expect(page.locator("main").getByText(ART_TITLE).first()).toBeVisible();
  });
});

test.describe("草稿不可见(T034)", () => {
  test("草稿保存后前台 404,归档不出现", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await createArticle(page, {
      title: DRAFT_TITLE,
      slug: DRAFT_SLUG,
      bodyMd: "尚未写完的 E2E 草稿。",
      status: "draft",
    });
    const res = await page.goto(`/post/${DRAFT_SLUG}`);
    expect(res?.status()).toBe(404);
    await page.goto("/announcements");
    await expect(page.getByText(DRAFT_TITLE)).toHaveCount(0);
  });
});

test.describe("越权(T034)", () => {
  test("moderator 访问后台被 middleware 拦回登录页,API 403", async ({ page }) => {
    await login(page, "m3moderator", "moderatorpass123");
    await page.goto("/admin/articles");
    // edge 层先拦(role!=admin → /login?next=…);RSC 深校验(redirect /+审计)由集成测试覆盖
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Farticles$/);
    const res = await page.request.post("/api/admin/articles", {
      data: { title: "越权", categoryId: 1, bodyMd: "x", status: "draft" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });
});
