import { expect, test, type Page } from "@playwright/test";

/**
 * T028 US3 内容前台 E2E(quickstart S3,SC-202 前台半/SC-204):
 * 归档分页 10/页+draft 不可见+标题搜索/详情 TOC 锚点+views+1/
 * 静态页 5 页可达+随机 slug 404/首页四区块。
 */

async function viewsText(page: Page) {
  const text = await page
    .getByText(/\d+ 次阅读/)
    .first()
    .innerText();
  return Number(/(\d+) 次阅读/.exec(text)![1]);
}

test.describe("归档(T023 FR-209)", () => {
  test("分页 10/页,总数与页码正确,draft 不可见", async ({ page }) => {
    await page.goto("/announcements");
    await expect(page.locator("main h1").first()).toContainText("公告");
    await expect(page.getByText("共 13 篇")).toBeVisible();
    const list = page.locator("main ul >> nth=0");
    await expect(list.locator("li")).toHaveCount(10);
    // 种子按日期倒序:最新种子公告在页 1 顶部
    await expect(list.locator("li").first()).toContainText("欢迎来到老克塔");
    await expect(page.getByText("草稿:未发布公告")).toHaveCount(0);

    await page.getByRole("link", { name: "下一页 →" }).click();
    await expect(page).toHaveURL(/\/announcements\?page=2$/);
    await expect(page.getByText("第 2 / 2 页")).toBeVisible();
    await expect(page.locator("main ul >> nth=0").locator("li")).toHaveCount(3);
    await page.getByRole("link", { name: "← 上一页" }).click();
    await expect(page).toHaveURL(/\/announcements$/);
  });

  test("标题搜索命中与清除(FR-209)", async ({ page }) => {
    await page.goto("/announcements");
    await page.getByPlaceholder("搜索标题…").fill("服务器");
    await page.getByRole("button", { name: "搜索" }).click();
    await expect(page).toHaveURL(/\/announcements\?q=/);
    await expect(page.getByText("共 1 篇")).toBeVisible();
    await expect(page.getByText("服务器开放公告").first()).toBeVisible();

    await page.getByRole("link", { name: "清除" }).click();
    await expect(page).toHaveURL(/\/announcements$/);
    await expect(page.getByText("共 13 篇")).toBeVisible();
  });
});

test.describe("文章详情(T024 FR-210/211)", () => {
  test("TOC 锚点跳转+分类面包屑", async ({ page }) => {
    await page.goto("/post/seed-announcement-second");
    await expect(page.getByRole("heading", { name: "服务器开放公告" })).toBeVisible();
    const toc = page.getByRole("navigation", { name: "目录" });
    await expect(toc.getByRole("link", { name: "开放安排" })).toBeVisible();
    await toc.getByRole("link", { name: "开放安排" }).click();
    // rehype-slug v6 默认 user-content- 前缀
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(
      "#user-content-开放安排",
    );
    await expect(page.getByRole("heading", { name: "开放安排" })).toBeVisible();
    // 分类面包屑可达归档(限定 article 内,避开侧栏同名归档链接)
    await page
      .locator("article")
      .getByRole("link", { name: "公告" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/announcements$/);
  });

  test("views 原子 +1(无 JS 环境精确断言,SC-203 前台半)", async ({ browser }) => {
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const page = await nojs.newPage();
    await page.goto("/post/seed-announcement-welcome");
    const before = await viewsText(page);

    const res = await page.request.post(
      "http://localhost:3000/api/content/article/seed-announcement-welcome/view",
    );
    expect(res.status()).toBe(200);
    expect((await res.json()).views).toBe(before + 1);
    await nojs.close();
  });

  test("draft 详情不可见(404)", async ({ page }) => {
    const res = await page.goto("/post/seed-article-draft");
    expect(res?.status()).toBe(404);
  });
});

test.describe("静态页与兜底(T025 FR-210/R15)", () => {
  for (const [slug, title] of [
    ["about", "项目简介"],
    ["tutorial", "使用教程"],
    ["agreement", "用户协议"],
    ["convention", "论坛公约"],
    ["sitemap", "网站地图"],
  ] as const) {
    test(`/${slug} 渲染「${title}」`, async ({ page }) => {
      await page.goto(`/${slug}`);
      // 正文 MD 首个 H1 与页头 H1 同名,取其一断言即可
      await expect(
        page.getByRole("heading", { name: title }).first(),
      ).toBeVisible();
    });
  }

  test("随机 slug 落 notFound(404)", async ({ page }) => {
    const res = await page.goto("/this-page-never-exists-9527");
    expect(res?.status()).toBe(404);
  });
});

test.describe("首页四区块(T027)", () => {
  test("公告/服务器状态/当前阶段/精选商品齐备", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "最新公告" })).toBeVisible();
    await expect(
      page.getByTestId("home-server-status").getByRole("heading", { name: "服务器状态" }),
    ).toBeVisible();
    // 渐进指针缺省回退:最新 open=第二阶段,下一=locked 第三阶段(SC-204)
    await expect(page.getByText("第二阶段·熔火之心").first()).toBeVisible();
    await expect(page.getByText(/下一阶段:第三阶段·黑翼之巢/)).toBeVisible();
    const featured = page.getByRole("heading", { name: "精选商品" });
    await expect(featured).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /积分/ }).first()).toBeVisible();
  });
});
