import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import Redis from "ioredis";
import { PrismaClient } from "../../src/generated/business";

/**
 * M4 US4 统计看板 E2E(T027,quickstart S4):
 * ① 权限口径:游客与 user 访问 /admin/stats → edge 角色校验拦截回登录页;
 * ② 404 采集闭环:浏览器访问不存在路径 → 全局 404 页 beacon 上报 →
 *    admin 看板「404 路径 Top 10」出现该路径(FR-312 端到端);
 * ③ 看板整页:ADMIN_NAV「看板」入口+五区块+手动刷新+umami 未配置降级文案。
 * umami 配置行用前暂存/用后还原(不吞 T028 联调配置);redis 404 键跑前全清、自家键用后 hdel。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const MISSING_PATH = `/nt-${RUN}/e2e-missing`;
const UMAMI_KEYS = [
  "umami.scriptUrl",
  "umami.websiteId",
  "umami.apiUrl",
  "umami.apiUsername",
  "umami.apiPassword",
];

// spec 进程不经 pnpm dev 加载 .env,读同一文件取 dev redis(E2E 与集成共享)
const redisUrl =
  fs.readFileSync(".env", "utf8").match(/^REDIS_URL=(.+)$/m)?.[1]?.trim() ??
  "redis://localhost:6381/0";
const redis = new Redis(redisUrl);

let umamiBackup: { key: string; value: string }[] = [];

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

test.beforeAll(async () => {
  umamiBackup = await prisma.systemConfig.findMany({
    where: { key: { in: UMAMI_KEYS } },
    select: { key: true, value: true },
  });
  await prisma.systemConfig.deleteMany({ where: { key: { in: UMAMI_KEYS } } });
  // 404 榜聚合读近 7 日 redis hash(48h EXPIRE),库重置清不掉——
  // 先清历史键,否则跨 run 残留(draft 404 探访等)挤占 Top 10 致闭环断言翻车
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "stats:404:*", "COUNT", 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
});

test.afterAll(async () => {
  await redis.hdel(todayKey(), MISSING_PATH);
  redis.disconnect();
  await prisma.systemConfig.deleteMany({ where: { key: { in: UMAMI_KEYS } } });
  if (umamiBackup.length > 0) {
    await prisma.systemConfig.createMany({ data: umamiBackup });
  }
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
    await expect(page.getByRole("heading", { name: "统计看板" })).toHaveCount(0);
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

  test("看板整页:ADMIN_NAV 入口+五区块+手动刷新+umami 未配置降级(SC-306)", async ({
    page,
  }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/stats");
    await expect(page.getByRole("heading", { name: "统计看板" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "看板" }).filter({ hasText: "看板" }).first(),
    ).toHaveAttribute("href", "/admin/stats");

    for (const testid of [
      "stats-online",
      "stats-article-top",
      "stats-product-sales",
      "stats-notfound-top",
      "stats-trade",
      "stats-umami",
    ]) {
      await expect(page.getByTestId(testid)).toBeVisible();
    }
    await expect(page.getByTestId("stats-umami")).toContainText("未接入 Umami");
    // 商品销量榜:累计/近 30 天切换链接
    await expect(
      page.getByTestId("stats-product-sales").getByRole("link", { name: "近 30 天" }),
    ).toHaveAttribute("href", "/admin/stats?sales=30d");

    await page.getByTestId("stats-refresh").click();
    await expect(page.getByTestId("stats-refresh")).toHaveText(/刷新中…|再刷新一次/);
    await expect(page.getByTestId("stats-online")).toBeVisible();
  });
});
