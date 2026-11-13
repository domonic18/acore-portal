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
    // 列表为单一 bg-panel 容器(条目间不露站点背景图,2026-11-09 用户反馈)
    await expect(list).toHaveClass(/bg-panel/);
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

  test("资讯卡片:正文首图作封面,条目并入单一背景容器(2026-11-09 用户反馈)", async ({
    page,
  }) => {
    await page.goto("/news");
    await expect(page.getByText("共 1 篇").first()).toBeVisible();
    // 限定列表区(右栏热门资讯也链接到同一文章,避免 strict mode 撞车)
    const card = page
      .locator("main ul >> nth=0")
      .locator("a[href='/post/seed-news-cover']");
    await expect(card).toBeVisible();
    await expect(card.locator("img")).toHaveAttribute(
      "src",
      "/images/banner-wotlk.svg",
    );
    // 条目自身无边框(0px):边框与背景统一由外层 bg-panel 容器承载,
    // 条目之间不再露出站点背景图
    expect(await card.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe(
      "0px",
    );
  });
});

test.describe("文章详情(T024 FR-210/211)", () => {
  test("目录:左侧吸顶目录列+锚点跳转+分类面包屑", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/post/seed-announcement-second");
    await expect(page.getByRole("heading", { name: "服务器开放公告" })).toBeVisible();
    // xl+:目录在正文左侧 rail(吸顶),顶部回落块不渲染
    const toc = page.getByTestId("article-toc-rail");
    await expect(toc.getByRole("link", { name: "开放安排" })).toBeVisible();
    // 顶部回落块 xl 下仍在 DOM 但隐藏(display:none 不进无障碍树)
    await expect(page.getByTestId("article-toc-top")).toBeHidden();
    const { position, top } = await toc.evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, top: s.top };
    });
    expect(position).toBe("sticky");
    expect(top).toBe("96px");
    // 目录列在正文面板左侧
    const panel = page.getByTestId("content-panel").first();
    expect((await toc.boundingBox())!.x).toBeLessThan((await panel.boundingBox())!.x);
    // 条目逐行排列(垂直列表,非同行多列)
    const links = toc.locator("a");
    const ys = await links.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().y)),
    );
    expect(new Set(ys).size).toBe(ys.length);

    await toc.getByRole("link", { name: "开放安排" }).click();
    // rehype-slug v6 默认 user-content- 前缀
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(
      "#user-content-开放安排",
    );
    // scroll-mt:目标标题不被 88px 吸顶页头遮住
    const heading = page.getByRole("heading", { name: "开放安排" });
    expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(88);
    // 分类面包屑可达归档(限定 article 内,避开侧栏同名归档链接)
    await page
      .locator("article")
      .getByRole("link", { name: "公告" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/announcements$/);
  });

  test("右栏内置组件:在线人数/最新资讯并入侧栏注册表(2026-11-05 后台可配)", async ({ page }) => {
    await page.goto("/post/seed-announcement-second");
    const sidebar = page.getByTestId("site-sidebar");
    // 在线人数卡(status.enabled 缺省=开)与最新资讯卡按默认范围(文章页)渲染
    await expect(sidebar.getByTestId("sidebar-server-status")).toBeVisible();
    await expect(sidebar.getByTestId("sidebar-latest-news")).toBeVisible();
    // 公告类文章:右栏含站内信推送提示卡(文章详情私有,非页面级配置)
    await expect(page.getByTestId("article-announcement-note")).toBeVisible();
  });

  test("views 原子 +1(无 JS 环境精确断言,SC-203 前台半)", async ({ browser }) => {    const nojs = await browser.newContext({ javaScriptEnabled: false });
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

  for (const [slug, title] of [
    ["hardcore-mode", "硬核模式介绍"],
    ["mount-guide", "坐骑掉落与获取指南"],
    ["hd-client", "高清端下载与试用指南"],
    ["client-extract", "客户端下载解压方法"],
    ["login-troubleshoot", "常见登录问题排查"],
    ["patch-guide", "补丁说明与生效方法"],
  ] as const) {
    test(`/${slug} 渲染「${title}」(快捷操作页升格)`, async ({ page }) => {
      await page.goto(`/${slug}`);
      await expect(page.getByRole("heading", { name: title }).first()).toBeVisible();
    });
  }

  test("旧 /post/ 教程链接 308 跳静态页", async ({ page }) => {
    await page.goto("/post/硬核挑战模式一命模式");
    await expect(page).toHaveURL(/\/hardcore-mode$/);
  });

  test("网站地图页渲染分组链接(固定栏目+动态版块/分类)", async ({ page }) => {
    await page.goto("/sitemap");
    const groups = page.getByTestId("sitemap-groups");
    await expect(groups).toBeVisible();
    await expect(groups.getByRole("heading", { name: "主要栏目" })).toBeVisible();
    await expect(
      groups.getByRole("link", { name: "公告", exact: true }),
    ).toHaveAttribute("href", "/announcements");
    // 动态分组:论坛版块含种子版块链接,商城分类带 category 过滤参数
    await expect(groups.getByRole("heading", { name: "论坛版块" })).toBeVisible();
    await expect(groups.getByRole("heading", { name: "商城分类" })).toBeVisible();
    await expect(groups.locator('a[href^="/forum/"]').first()).toBeVisible();
    await expect(groups.locator('a[href^="/shop?category="]').first()).toBeVisible();
  });

  test("随机 slug 落 notFound(404)", async ({ page }) => {
    const res = await page.goto("/this-page-never-exists-9527");
    expect(res?.status()).toBe(404);
  });
});

/**
 * Markdown 渲染基线(2026-11-05 用户反馈:静态页加粗/''斜体看不出效果):
 * 加粗须与正文异色、有序列表须有编号、存量 WP 原始 HTML 表格须保留。
 */
test.describe("Markdown 渲染基线(强调/列表/原始 HTML)", () => {
  const prisma = new PrismaClient();
  const FIX_SLUG = "e2e-markdown-render";
  const BODY = [
    "# 渲染基线",
    "",
    "**重点提示**：这里必须醒目。",
    "",
    "斜体 ''重点'' 内容。",
    "",
    "1. 第一步",
    "2. 第二步",
    "",
    "<table><tbody><tr><td>坐骑名称</td><td>来源</td></tr></tbody></table>",
  ].join("\n");

  test.beforeAll(async () => {
    await prisma.contentPage.upsert({
      where: { slug: FIX_SLUG },
      update: { title: "渲染基线", bodyMd: BODY, status: "published" },
      create: {
        slug: FIX_SLUG,
        title: "渲染基线",
        bodyMd: BODY,
        status: "published",
      },
    });
  });

  test.afterAll(async () => {
    await prisma.contentPage.deleteMany({ where: { slug: FIX_SLUG } });
    await prisma.$disconnect();
  });

  test("加粗异色醒目/斜体可识别/有序列表有编号/原始 HTML 表格保留", async ({ page }) => {
    await page.goto(`/${FIX_SLUG}`);
    const strong = page.locator("article strong").first();
    await expect(strong).toBeVisible();
    const strongStyle = await strong.evaluate((el) => ({
      color: getComputedStyle(el).color,
      weight: Number(getComputedStyle(el).fontWeight),
      baseColor: getComputedStyle(el.parentElement as HTMLElement).color,
    }));
    // 与正文同色=看不出加粗(旧实现缺陷)
    expect(strongStyle.color).not.toBe(strongStyle.baseColor);
    expect(strongStyle.weight).toBeGreaterThanOrEqual(700);
    // ''斜体'' → <em>
    await expect(page.locator("article em").first()).toHaveText("重点");
    // 有序列表编号(Tailwind preflight 清空 list-style,须显式恢复)
    const listStyle = await page
      .locator("article ol li")
      .first()
      .evaluate((el) => getComputedStyle(el).listStyleType);
    expect(listStyle).toBe("decimal");
    // 存量原始 HTML 表格保留(旧实现整块丢失)
    await expect(page.locator("article table")).toBeVisible();
    await expect(page.locator("article table td").first()).toHaveText("坐骑名称");
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

  test("目录统一逻辑:静态页与文章页同款左侧目录列,无标题页不渲染", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tutorial");
    const toc = page.getByTestId("article-toc-rail");
    // e2e 种子教程正文标题=下载三步(迁移库为注册~登录六步,同为 h2)
    await expect(toc.getByRole("link", { name: /下载客户端/ })).toBeVisible();
    await expect(page.getByTestId("article-toc-top")).toBeHidden();
    await toc.getByRole("link", { name: /下载客户端/ }).click();
    // 教程页下载区走旧站稳定锚点(sectionAnchors 覆写,菜单与外链共用)
    expect(new URL(page.url()).hash).toBe("#client_download");
    // 无 h2-h4 标题的页面(种子 sitemap 正文为空)不渲染目录列
    await page.goto("/sitemap");
    await expect(page.getByTestId("article-toc-rail")).toHaveCount(0);
    await expect(page.getByTestId("article-toc-top")).toHaveCount(0);
  });

  test("渐进页:源站同款左右交替时间轴", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/progression");
    await expect(page.getByRole("heading", { name: "渐进计划", level: 1 })).toBeVisible();
    const overview = page.getByRole("region", { name: "阶段概览" });
    await expect(overview.getByText("当前阶段")).toBeVisible();
    await expect(overview.getByText("下一阶段")).toBeVisible();
    await expect(
      overview.getByRole("link", { name: "第二阶段·熔火之心" }),
    ).toHaveAttribute("href", /^#node-/);
    await expect(
      overview.getByRole("link", { name: "第三阶段·黑翼之巢" }),
    ).toHaveAttribute("href", /^#node-/);
    await expect(page.getByTestId("progression-countdown")).toBeVisible();

    // 时间轴逐档渲染:日期 + 标题 + 节点锚点
    const timeline = page.locator("ol li[id^='node-']");
    await expect(timeline).toHaveCount(3);
    await expect(
      timeline.getByRole("heading", { name: "第一阶段·开放测试" }),
    ).toBeVisible();
    await expect(
      timeline.getByRole("heading", { name: "第三阶段·黑翼之巢" }),
    ).toBeVisible();
    await expect(
      timeline.getByText(/^\d{4}年\d{1,2}月\d{1,2}日$/).first(),
    ).toBeVisible();

    // 桌面左右交替:奇数档卡片在右列,偶数档在左列(卡片位由外层栅格容器决定)
    const firstCard = timeline.first().locator("article");
    const secondCard = timeline.nth(1).locator("article");
    expect(
      await firstCard.evaluate((el) => getComputedStyle(el.parentElement!).gridColumnStart),
    ).toBe("3");
    expect(
      await secondCard.evaluate((el) => getComputedStyle(el.parentElement!).gridColumnStart),
    ).toBe("1");
  });

  test("侧栏快捷菜单:补丁下载卡直达锚点,长栏吸顶", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/tutorial");
    const patchCard = page.getByTestId("sidebar-card-patch");
    await expect(
      patchCard.getByRole("link", { name: "补丁下载 · patch-zhCN-5.MPQ" }),
    ).toHaveAttribute("href", "/tutorial#patch_download");
    // 静态页右栏随滚动吸顶(与 ArticleAside 同款 lg:sticky lg:top-24,88px 页头+间距)
    const aside = page.getByTestId("site-sidebar");
    const { position, top } = await aside.evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, top: s.top };
    });
    expect(position).toBe("sticky");
    expect(top).toBe("96px");
  });

  test("开发日志页:Markdown 静态页,面包屑 首页 › 开发日志,全量不分页", async ({ page }) => {
    await page.goto("/devlog");
    const crumb = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumb.getByRole("link", { name: "首页" })).toHaveAttribute("href", "/");
    await expect(crumb.getByText("开发日志")).toBeVisible();
    await expect(page.getByRole("heading", { name: "开发日志", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /\d{4}-\d{2}-\d{2} 开发日志/ }).first(),
    ).toBeVisible();
    // 单页全量展示,无归档分页控件
    await expect(page.getByRole("link", { name: "下一页 →" })).toHaveCount(0);
  });
});

test.describe("内容区底色(页面背景图为装饰层,文字不直压背景)", () => {
  // 用户反馈 2026-10-31:/about 等页正文直接铺在全站背景图上,缺区域底色。
  // ContentPanel 统一提供面板底(=account-shell 同款),此组守住回归。
  for (const path of [
    "/about",
    "/tutorial",
    "/post/seed-announcement-second",
    "/login",
    "/register",
    "/cart",
    "/checkout",
    "/shop",
    "/forum",
    "/wp-admin/profile.php?page=acore-item-restore",
    "/this-page-never-exists-9527",
  ]) {
    test(`${path} 内容区有自身底色面板`, async ({ page }) => {
      await page.goto(path);
      const panel = page.getByTestId("content-panel").first();
      await expect(panel).toBeVisible();
      const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    });
  }

  // 2026-11-05 用户反馈:左侧目录列曾直铺全站背景图,须与正文面板同底
  test("左侧目录列有自身底色面板", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/post/seed-announcement-second");
    const toc = page.getByTestId("article-toc-rail");
    await expect(toc).toBeVisible();
    const bg = await toc.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  // 页面级目录开关(2026-11-05):devlog 显式关闭,优先于全局设置(种子含多级标题,断言有区分度)
  test("页面级目录开关优先于全局(devlog 显式关闭)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/devlog");
    await expect(page.getByRole("heading", { name: "开发日志", level: 1 })).toBeVisible();
    await expect(page.getByTestId("article-toc-rail")).toHaveCount(0);
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

  // 精选商品区仅登录可见(口径同顶部菜单 authOnly,2026-11-10 用户反馈)
  async function loginAsUser(page: Page) {
    await page.goto("/login");
    await page.getByLabel("用户名").fill("legacyuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass123");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
    await page.goto("/");
  }

  test("游客:精选商品区与快捷入口「积分商店」隐藏(口径同顶部菜单)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "最新公告" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "精选商品", exact: true })).toHaveCount(0);
    const quick = page.locator("main section").filter({ hasText: "补丁生效方法" }).first();
    await expect(quick.getByRole("link", { name: "积分商店", exact: true })).toHaveCount(0);
    // 同组其余入口不受影响
    await expect(quick.getByRole("link", { name: "英雄榜" })).toBeVisible();
    await expect(quick.getByRole("link", { name: "开发日志" })).toBeVisible();
  });

  test("公告/服务器状态(含当前阶段)/精选商品齐备", async ({ page }) => {
    await loginAsUser(page);
    await expect(page.getByRole("heading", { name: "最新公告" })).toBeVisible();
    await expect(
      page.getByTestId("home-server-status").getByRole("heading", { name: "服务器状态" }),
    ).toBeVisible();
    // #64:当前阶段独立区块下线,阶段名由状态卡 chip 展示(渐进指针缺省回退=第二阶段,SC-204)
    await expect(page.getByTestId("status-stage")).toContainText("第二阶段·熔火之心");
    await expect(page.getByRole("heading", { name: "当前阶段" })).toHaveCount(0);
    const featured = page.getByRole("heading", { name: "精选商品" });
    await expect(featured).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: /积分/ }).first()).toBeVisible();
    // 登录态:快捷入口「积分商店」可见(与游客隐藏用例互为对照)
    const quick = page.locator("main section").filter({ hasText: "补丁生效方法" }).first();
    await expect(quick.getByRole("link", { name: "积分商店", exact: true })).toBeVisible();
  });

  test("精选商品轮播:主图/名称/积分,箭头可切换", async ({ page }) => {
    await loginAsUser(page);
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

  test("右侧快捷入口:下载项指向教程锚点与迁移文章", async ({ page }) => {
    await page.goto("/");
    const quick = page
      .locator("main section")
      .filter({ hasText: "补丁生效方法" })
      .first();
    await expect(quick.getByRole("link", { name: "普清端" })).toHaveAttribute(
      "href",
      "/tutorial#client_download",
    );
    await expect(quick.getByRole("link", { name: "高清端" })).toHaveAttribute(
      "href",
      "/hd-client",
    );
    await expect(quick.getByRole("link", { name: "解压方法" })).toHaveAttribute(
      "href",
      "/client-extract",
    );
    await expect(quick.getByRole("link", { name: "常见登录问题" })).toHaveAttribute(
      "href",
      "/login-troubleshoot",
    );
    await expect(quick.getByRole("link", { name: "补丁生效方法" })).toHaveAttribute(
      "href",
      "/patch-guide",
    );
    // 硬核模式指向迁移后的模式说明文章,不再落到教程页(issue #21)
    await expect(quick.getByRole("link", { name: "硬核模式" })).toHaveAttribute(
      "href",
      "/hardcore-mode",
    );
    // 注册方法指教程页(原站 ?page_id=2=使用教程,教程开头即注册步骤),非注册表单
    await expect(quick.getByRole("link", { name: "注册方法" })).toHaveAttribute(
      "href",
      "/tutorial",
    );
    const downloadHrefs = await quick
      .getByRole("link", { name: "下载", exact: true })
      .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(downloadHrefs).toEqual([
      "/tutorial#login_download",
      "/tutorial#patch_download",
    ]);
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

    // 页面背景挂在 html(2026-11-06 主题系统):background-attachment:fixed 需挂 html
    // 才是视口相对,body 保持透明让内容面板叠在上面
    const pageBg = await page
      .locator("html")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(pageBg).toContain("background.jpg");

    const headerBg = await page
      .getByRole("banner")
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(headerBg).toContain("background.jpg");

    // 800×313 生产原图(WP 原版 Logo 迁移),54px 显示不糊
    await expect(
      page.getByRole("banner").locator('img[alt="老克塔"]'),
    ).toHaveAttribute("width", "800");
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
