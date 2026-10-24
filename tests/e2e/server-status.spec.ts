import { expect, test } from "@playwright/test";
import Redis from "ioredis";

/**
 * T046 E2E(US6/S6,SC-208 渲染半):状态卡正常渲染(mock 样例字段+种子阶段)/
 * 30s 轮询(page.clock fake timer 推进触发 /api/status 拉取)/降级徽标
 * (探针失败→lastok 回退,徽标+上次值保留)/冷启动失败两态渲染(--/N/A/离线)。
 * 注入半(降级缓存语义/峰值 max/审计)由 T042 集成覆盖。
 * mock 态与探针键(status:probe{,:lastok})用后还原,防污染其他 spec/集成测试。
 */
const MOCK_BASE = process.env.SOAP_MOCK_URL ?? "http://localhost:7878";
const UPTIME_SAMPLE = "3 days, 4 hours, 12 minutes";
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6381/0");

async function setMockMode(mode: "normal" | "failure") {
  await fetch(`${MOCK_BASE}/__mode?mode=${mode}`);
}

async function resetProbeCache() {
  await redis.del("status:probe");
  await redis.del("status:probe:lastok");
}

test.afterEach(async () => {
  await resetProbeCache();
  await setMockMode("normal");
});

test("状态卡正常渲染:mock 样例字段+种子阶段+无降级徽标", async ({ page }) => {
  await setMockMode("normal");
  await resetProbeCache();
  await page.goto("/");
  const card = page.getByTestId("home-server-status");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("status-online-count")).toHaveText(/^\d+$/);
  await expect(page.getByTestId("status-faction")).toHaveText(/^\d+ : \d+$/);
  await expect(page.getByTestId("status-uptime")).toHaveText(UPTIME_SAMPLE);
  await expect(page.getByTestId("status-queue")).toHaveText("3");
  await expect(card).toContainText("当前阶段:");
  await expect(page.getByTestId("status-degraded")).toHaveCount(0);
});

test("30s 轮询:fake timer 推进触发 /api/status 拉取", async ({ page }) => {
  await page.clock.install();
  const statusFetch = page.waitForRequest((req) =>
    req.url().includes("/api/status"),
  );
  await page.goto("/");
  await page.clock.fastForward(30_000);
  const req = await statusFetch;
  expect(req.url()).toContain("/api/status");
});

test("降级徽标:探针失败回退上次成功值(数据延迟+缓存保留)", async ({ page }) => {
  await setMockMode("normal");
  await resetProbeCache();
  await page.goto("/"); // 冷探针成功:写入缓存与 lastok
  await expect(page.getByTestId("status-uptime")).toHaveText(UPTIME_SAMPLE);
  await expect(page.getByTestId("status-degraded")).toHaveCount(0);

  await setMockMode("failure");
  await redis.del("status:probe"); // 保 lastok → 回退渲染路径
  await page.reload();
  await expect(page.getByTestId("status-degraded")).toBeVisible();
  await expect(page.getByTestId("status-uptime")).toHaveText(UPTIME_SAMPLE);
});

test("冷启动失败两态渲染:数字 -- / 队列 N/A / 离线", async ({ page }) => {
  await setMockMode("failure");
  await resetProbeCache(); // 无缓存无 lastok → 数字字段 null 渲染
  await page.goto("/");
  const card = page.getByTestId("home-server-status");
  await expect(page.getByTestId("status-degraded")).toBeVisible();
  await expect(page.getByTestId("status-online-count")).toHaveText("--");
  await expect(page.getByTestId("status-faction")).toHaveText("-- : --");
  await expect(page.getByTestId("status-queue")).toHaveText("N/A");
  await expect(card).toContainText("离线");
});
