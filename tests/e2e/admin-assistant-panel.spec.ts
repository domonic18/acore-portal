import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { beijingDateKey } from "../../src/lib/format";

/**
 * 后台仪表盘「AI 助手」面板 E2E(M9 W8):
 * 播种当日用量行与问题词 → 面板展示调用量/失败率/token/热门问题词 → 用后还原。
 */
const prisma = new PrismaClient();
const DAY = beijingDateKey();
const KEYWORD = `e2e词${Date.now().toString(36).slice(-4)}`;

let usageBackup: { calls: number; failures: number; promptTokens: number; completionTokens: number } | null =
  null;
let keywordBackup: { keyword: string; count: number }[] = [];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  usageBackup = await prisma.assistantUsage.findUnique({
    where: { day: DAY },
    select: { calls: true, failures: true, promptTokens: true, completionTokens: true },
  });
  keywordBackup = await prisma.assistantUsageKeyword.findMany({
    where: { day: DAY },
    select: { keyword: true, count: true },
  });
  await prisma.assistantUsage.upsert({
    where: { day: DAY },
    create: { day: DAY, calls: 42, failures: 4, promptTokens: 1000, completionTokens: 234 },
    update: { calls: 42, failures: 4, promptTokens: 1000, completionTokens: 234 },
  });
  await prisma.assistantUsageKeyword.upsert({
    where: { day_keyword: { day: DAY, keyword: KEYWORD } },
    create: { day: DAY, keyword: KEYWORD, count: 3 },
    update: { count: 3 },
  });
});

test.afterAll(async () => {
  await prisma.assistantUsageKeyword.deleteMany({ where: { day: DAY, keyword: KEYWORD } });
  if (usageBackup) {
    await prisma.assistantUsage.update({
      where: { day: DAY },
      data: usageBackup,
    });
  } else {
    await prisma.assistantUsage.deleteMany({ where: { day: DAY } });
  }
  await prisma.$disconnect();
});

test("仪表盘 AI 助手面板:调用量/失败率/token/热门问题词", async ({ page }) => {
  await login(page);
  await page.goto("/admin");

  const panel = page.getByTestId("admin-assistant-panel");
  await expect(panel.getByText("今日调用", { exact: true })).toBeVisible();
  await expect(panel.getByText("42", { exact: true }).first()).toBeVisible();
  await expect(panel.getByText("10%", { exact: true })).toBeVisible();
  await expect(panel.getByText("1234", { exact: true })).toBeVisible();
  await expect(panel.getByText(KEYWORD, { exact: true })).toBeVisible();
});
