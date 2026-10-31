import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

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
    // 「共 N 篇」在标题副行与分页汇总各出现一次(设计稿双处),取标题副行
    await expect(page.getByText("共 13 篇").first()).toBeVisible();
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
    await expect(page.getByText("共 1 篇").first()).toBeVisible();
    await expect(page.getByText("服务器开放公告").first()).toBeVisible();

    await page.getByRole("link", { name: "清除" }).click();
    await expect(page).toHaveURL(/\/announcements$/);
    // 「共 N 篇」在标题副行与分页汇总各出现一次(设计稿双处),取标题副行
    await expect(page.getByText("共 13 篇").first()).toBeVisible();
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
      "/api/content/article/seed-announcement-welcome/view",
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

test.describe("p02 设计稿壳(简介/教程/渐进/日志)", () => {
  test("简介页:面包屑+更新日期+当前阶段联动", async ({ page }) => {
    await page.goto("/about");
    const crumb = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumb.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    await expect(crumb.getByText("项目简介")).toBeVisible();
    await expect(page.getByText(/^更新：\d{4}-\d{2}-\d{2}$/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "第二阶段·熔火之心" }),
    ).toHaveAttribute("href", /^\/progression#node-/);
  });

  test("教程页:面包屑 首页 › 使用教程", async ({ page }) => {
    await page.goto("/tutorial");
    const crumb = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumb.getByRole("link", { name: "首页" })).toBeVisible();
    await expect(crumb.getByText("使用教程")).toBeVisible();
  });

  test("渐进页:三状态卡+倒计时+全部阶段锚点", async ({ page }) => {
    await page.goto("/progression");
    await expect(page.getByRole("heading", { name: "渐进计划" })).toBeVisible();
    const overview = page.getByRole("region", { name: "阶段概览" });
    for (const label of ["当前阶段", "下一阶段", "远期 · 下个大版本"]) {
      await expect(overview.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "全部阶段" })).toBeVisible();
    await expect(page.getByTestId("progression-countdown")).toBeVisible();
    // 状态卡锚点直达时间轴当前阶段行
    const current = page.locator('a[href^="#node-"]').first();
    await expect(current).toHaveText("第二阶段·熔火之心");
  });

  test("开发日志页:面包屑 公告 › 开发日志 + 持续更新", async ({ page }) => {
    await page.goto("/devlog");
    const crumb = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumb.getByRole("link", { name: "公告" })).toHaveAttribute(
      "href",
      "/announcements",
    );
    await expect(crumb.getByText("开发日志")).toBeVisible();
    await expect(page.getByText(/共 \d+ 篇 · 持续更新/)).toBeVisible();
  });
});

test.describe("首页四区块(T027)", () => {
  // e2e 独立库无存量导入数据:轮播位/精选商品需自带物料与商品夹具
  const prisma = new PrismaClient();
  const FIX_RUN = Date.now().toString(36);
  const FIX_PRODUCT_PREFIX = `e2econtent-${FIX_RUN}-`;
  const FIX_CATEGORY_SLUG = `e2econtent-cat-${FIX_RUN}`;

  test.beforeAll(async () => {
    const category = await prisma.productCategory.create({
      data: { name: `E2E 首页商品 ${FIX_RUN}`, slug: FIX_CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    });
    await prisma.homeBanner.createMany({
      data: [1, 2, 3].map((i) => ({
        title: `E2E 轮播 ${i} ${FIX_RUN}`,
        imageUrl: `/images/e2e-banner-${i}.jpg`,
        linkUrl: "",
        sort: i,
        enabled: true,
      })),
    });
    await prisma.product.createMany({
      data: [1, 2, 3].map((i) => ({
        type: "game_item" as const,
        sku: `e2econtent_fix_${FIX_RUN}_${i}`,
        slug: `${FIX_PRODUCT_PREFIX}${i}`,
        name: `E2E 精选商品 ${i} ${FIX_RUN}`,
        description: "",
        images: [`/images/e2e-product-${i}.jpg`],
        categoryId: category.id,
        price: 100 + i,
        status: "published" as const,
        listed: true,
        featured: true,
      })),
    });
  });

  test.afterAll(async () => {
    await prisma.homeBanner.deleteMany({ where: { title: { contains: FIX_RUN } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: FIX_PRODUCT_PREFIX } } });
    await prisma.productCategory.deleteMany({ where: { slug: FIX_CATEGORY_SLUG } });
    await prisma.$disconnect();
  });

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

  test("精选商品轮播:主图/名称/积分,箭头可切换", async ({ page }) => {
    await page.goto("/");
    const card = page
      .getByRole("heading", { name: "精选商品" })
      .locator("xpath=ancestor::section[1]");
    const slide = card.locator('a[href^="/shop/"]').first();
    await expect(slide).toBeVisible();
    await expect(slide).toContainText(/积分/);
    const first = await slide.innerText();
    await card.getByRole("button", { name: "下一件商品" }).click();
    const next = card.locator('a[href^="/shop/"]').first();
    await expect(next).not.toHaveText(first);
    await expect(card.getByRole("button", { name: "第 1 件商品" })).toBeVisible();
  });

  test("首行等高:轮播与快捷入口 486px,右栏含论坛精华", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    const carousel = page.locator('section[aria-label="首页轮播"]');
    // 版心内仅首页快捷入口含「项目简介」分组名(页脚同名链接不在 main section 下)
    const quickLinks = page.locator("main section").filter({ hasText: "项目简介" }).first();
    const sliderBox = await carousel.boundingBox();
    const quickBox = await quickLinks.boundingBox();
    expect(sliderBox?.height).toBe(486);
    expect(Math.round(quickBox!.height)).toBe(Math.round(sliderBox!.height));

    const highlights = page.getByRole("heading", { name: "论坛精华" });
    await expect(highlights).toBeVisible();
    const card = highlights.locator("xpath=ancestor::section[1]");
    await expect(card.locator('a[href^="/forum/thread/"]').first()).toBeVisible();
  });

  test("站点外观:favicon/页面背景/页头背景与高清 logo", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
      "href",
      /favicon-32\.png$/,
    );

    const bodyBg = await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bodyBg).toContain("background.jpg");

    const headerBg = await page
      .getByRole("banner")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(headerBg).toContain("background.jpg");

    // 400×157 高倍源图,46px 显示不糊
    await expect(
      page.getByRole("banner").locator('img[alt="老克塔"]'),
    ).toHaveAttribute("width", "400");
  });

  test("版心对齐 lokta.cn:1920 下内容 1140px 居中,两侧露出页面背景", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    const box = await page.locator("main.container-site").boundingBox();
    expect(box).not.toBeNull();
    // max-width 1220 含左右各 40px 内边距 → 内容 1140,与生产版心一致
    expect(Math.round(box!.width)).toBe(1220);
    expect(Math.round(box!.x)).toBe(350);
  });
});
