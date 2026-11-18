import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 后台「AI 用量」与「AI 对话」页 E2E(2026-11-18 用户反馈):
 * NAV 两入口;用量页 KPI 与区间切换(7d/30d);对话页台账列表 + 行内展开拉消息时间线
 * (无 checkpoint 的 thread 显示暂无消息空态;消息往返由集成测试覆盖)。
 * 游客拦截;台账行用后清理。
 */
const prisma = new PrismaClient();
const THREAD = `e2e-sess-${Date.now().toString(36)}-list`;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.afterAll(async () => {
  await prisma.assistantSession.deleteMany({ where: { threadId: { startsWith: "e2e-sess-" } } });
  await prisma.$disconnect();
});

test("游客访问两新页 → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/ai-usage");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fai-usage/);
  await page.goto("/admin/assistant-sessions");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fassistant-sessions/);
});

test.describe.serial("admin AI 用量与 AI 对话页", () => {
  test("NAV 入口 + 用量页 KPI 与区间切换", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");
    const nav = page.getByRole("banner").getByRole("navigation");
    await expect(nav.getByRole("link", { name: "AI 用量" })).toHaveAttribute("href", "/admin/ai-usage");
    await expect(nav.getByRole("link", { name: "AI 对话" })).toHaveAttribute("href", "/admin/assistant-sessions");

    await page.goto("/admin/ai-usage");
    const view = page.getByTestId("admin-ai-usage");
    await expect(view).toBeVisible();
    await expect(view.getByText("近 7 日调用")).toBeVisible();
    await expect(view.getByText("失败率")).toBeVisible();
    await expect(view.getByText("日均调用")).toBeVisible();
    await expect(view.getByText("调用分布")).toBeVisible();

    await view.getByRole("link", { name: "近 30 天" }).click();
    await expect(page).toHaveURL(/\/admin\/ai-usage\?range=30d/);
    await expect(page.getByTestId("admin-ai-usage").getByText("近 30 日调用")).toBeVisible();
  });

  test("对话页:台账列表 + 行内展开(无 checkpoint → 空态)", async ({ page }) => {
    await prisma.assistantSession.create({
      data: {
        threadId: THREAD,
        userId: null,
        title: "E2E 会话标题示例",
        runs: 2,
        promptTokens: 120,
        completionTokens: 40,
        lastMessageAt: new Date(),
      },
    });
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/assistant-sessions");
    const list = page.getByTestId("admin-assistant-sessions");
    await expect(list.getByText("E2E 会话标题示例")).toBeVisible();
    await expect(list.getByText("已注销用户")).toBeVisible();

    // 展开按钮是 client 岛:水合前点击丢失不自愈,点一次没展开就再点(login.spec 口径);
    // 展开后 aria-label 由「查看会话…」变「收起会话…」,用正则匹配两种状态
    const expand = list.getByRole("button", { name: /会话「E2E 会话标题示例」/ });
    await expect(async () => {
      await expand.click();
      await expect(list.getByText("暂无可读消息")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    await expect(expand).toHaveAttribute("aria-expanded", "true");

    await expand.click();
    await expect(list.getByText("暂无可读消息")).toBeHidden();
  });
});
