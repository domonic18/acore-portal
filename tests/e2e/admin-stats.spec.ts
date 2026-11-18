import { expect, test, type Page } from "@playwright/test";
import Redis from "ioredis";
import { PrismaClient } from "../../src/generated/business";
import { resolveE2ERedisUrl } from "./redis-url";

/**
 * M4 US4 统计看板 E2E(T027,quickstart S4):
 * ① 权限口径:游客与 user 访问 /admin/stats → edge 角色校验拦截回登录页;
 * ② 404 采集闭环:浏览器访问不存在路径 → 全局 404 页 beacon 上报 →
 *    admin 看板「404 路径 Top 10」出现该路径(FR-312 端到端);
 * ②' 页面访问采集闭环:前台访问 → 客户端 beacon 上报 → page_view_event 落库
 *    → admin 看板「页面访问」区块可见(自建统计替代 umami);
 * ③ 看板整页(2026-11-07 重构后布局):ADMIN_NAV「看板」入口 + KPI 概览行 +
 *    流量类面板(趋势/来源/画像/热门页面/时段/搜索引擎/搜索词/蜘蛛)+
 *    实时面板(网站在线/最近访问,2026-11-17)+
 *    业务类面板(漏斗/销量/页面访问/404/文章)+ 区间切换 + 手动刷新。
 * ④ 实时面板闭环:游客+登录先后访问前台 → beacon 落 IP/账号 →
 *    「网站在线」出现该账号(登录按账号去重)、「最近访问」出现账号与路径。
 * redis 404/在线键族跑前全清、用后清理。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const MISSING_PATH = `/nt-${RUN}/e2e-missing`;
// spec 进程不经 pnpm dev 加载 .env,读同一文件取 dev redis(E2E 与集成共享)
const redis = new Redis(resolveE2ERedisUrl());

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `stats:404:${yyyy}${mm}${dd}`;
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function scanDelPattern(pattern: string) {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}

test.beforeAll(async () => {
  // 404 榜聚合读近 7 日 redis hash(48h EXPIRE),库重置清不掉——
  // 先清历史键,否则跨 run 残留(draft 404 探访等)挤占 Top 10 致闭环断言翻车
  await scanDelPattern("stats:404:*");
  // 在线滑窗键(5 分钟 TTL)同理清场,保证「在线人数」从 0 起算
  await scanDelPattern("stats:online:*");
});

test.afterAll(async () => {
  await redis.hdel(todayKey(), MISSING_PATH);
  await scanDelPattern("stats:online:*");
  await prisma.pageViewEvent.deleteMany({ where: { path: "/forum" } });
  redis.disconnect();
  await prisma.$disconnect();
});

test.describe("US4 统计看板(T027)", () => {
  test("越权拒绝:游客与 user 访问 /admin/stats 被 edge 拦截回登录页(FR-125)", async ({
    page,
  }) => {
    await page.goto("/admin/stats");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fstats$/);

    await login(page, "legacyuser", "oldpass123");
    await page.goto("/admin/stats");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fstats$/);
    await expect(page.getByRole("heading", { name: "看板" })).toHaveCount(0);
  });

  test("404 采集闭环:404 页 beacon 上报 → 看板 404 Top 榜出现该路径(FR-312)", async ({
    page,
  }) => {
    const beacon = page.waitForResponse(
      (r) => r.url().includes("/api/track/not-found") && r.request().method() === "POST",
    );
    await page.goto(MISSING_PATH);
    await expect(page.getByText("页面不存在或已迁移")).toBeVisible();
    expect((await beacon).status()).toBe(200);

    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/stats");
    const block = page.getByTestId("stats-notfound-top");
    await expect(block).toBeVisible();
    await expect(block).toContainText(MISSING_PATH);
  });

  test("页面访问采集闭环:前台访问 beacon 上报 → 看板页面访问区块(替代 umami)", async ({
    page,
  }) => {
    const beacon = page.waitForResponse(
      (r) => r.url().includes("/api/track/pageview") && r.request().method() === "POST",
    );
    await page.goto("/forum");
    expect((await beacon).status()).toBe(200);

    const row = await prisma.pageViewEvent.findFirstOrThrow({
      where: { path: "/forum" },
      orderBy: { id: "desc" },
    });
    expect(row.visitorId).toHaveLength(64);

    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/stats");
    const block = page.getByTestId("stats-pageview");
    await expect(block).toBeVisible();
    await expect(block).toContainText("PV");
    await expect(block).toContainText("UV");
  });

  test("看板整页:ADMIN_NAV 入口+各区块+手动刷新", async ({
    page,
  }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/stats");
    // 菜单收敛(2026-11-18):安全看板并入 /admin/stats 页内 Tab,页标题为组名「看板」
    await expect(page.getByRole("heading", { name: "看板" })).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "看板" }),
    ).toHaveAttribute("href", "/admin/stats");
    await expect(page.getByRole("tab", { name: "统计看板" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // KPI 概览行(在线/PV/UV/订单/积分/注册)
    for (const testid of [
      "stats-kpi-online",
      "stats-kpi-pv",
      "stats-kpi-uv",
      "stats-kpi-orders",
      "stats-kpi-points",
      "stats-kpi-users",
    ]) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }

    // 流量类面板 + 实时面板 + 业务类面板
    for (const testid of [
      "stats-article-top",
      "stats-product-sales",
      "stats-notfound-top",
      "stats-funnel",
      "stats-pageview",
      "stats-traffic-trend",
      "stats-traffic-source",
      "stats-audience",
      "stats-top-pages",
      "stats-hourly",
      "stats-search-engines",
      "stats-search-terms",
      "stats-spider",
      "stats-online",
      "stats-recent-visits",
    ]) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }

    // 商品销量榜:累计/近 30 天切换链接
    await expect(
      page.getByTestId("stats-product-sales").getByRole("link", { name: "近 30 天" }),
    ).toHaveAttribute("href", "/admin/stats?sales=30d");

    await page.getByTestId("stats-refresh").click();
    await expect(page.getByTestId("stats-refresh")).toHaveText(/刷新中…|再刷新一次/);
    await expect(page.getByTestId("stats-kpi-online")).toBeVisible();
  });

  test("区间切换:趋势面板的区间 chip 改写 URL 并生效", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/stats");
    const trend = page.getByTestId("stats-traffic-trend");
    await expect(trend).toBeVisible();
    await expect(trend.getByRole("link", { name: "近 30 天" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await trend.getByRole("link", { name: "近 7 天" }).click();
    await expect(page).toHaveURL(/range=7d/);
    await expect(trend.getByRole("link", { name: "近 7 天" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("实时面板闭环:游客+登录访问 → 在线人数/账号/IP 与最近访问可见", async ({
    page,
  }) => {
    // 游客访问(未登录)
    const guestBeacon = page.waitForResponse(
      (r) => r.url().includes("/api/track/pageview") && r.request().method() === "POST",
    );
    await page.goto("/forum");
    expect((await guestBeacon).status()).toBe(200);

    // 登录后再次访问:beacon 带会话,落 userId + IP
    await login(page, "m1admin", "adminpass123");
    const userBeacon = page.waitForResponse(
      (r) => r.url().includes("/api/track/pageview") && r.request().method() === "POST",
    );
    await page.goto("/forum");
    expect((await userBeacon).status()).toBe(200);

    await page.goto("/admin/stats");

    // 网站在线:登录按账号去重 → 面板出现 m1admin;计数 ≥ 1
    const online = page.getByTestId("stats-online");
    await expect(online).toBeVisible();
    await expect(online).toContainText("m1admin");
    await expect(online).toContainText("人在线");
    const count = Number(await page.getByTestId("stats-online-count").innerText());
    expect(count).toBeGreaterThanOrEqual(1);

    // 最近访问:最新条目含账号与路径
    const recent = page.getByTestId("stats-recent-visits");
    await expect(recent).toBeVisible();
    await expect(recent).toContainText("m1admin");
    await expect(recent).toContainText("/forum");
  });
});
