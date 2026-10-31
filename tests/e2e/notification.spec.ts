import { expect, test, type APIRequestContext } from "@playwright/test";
import { getPrisma } from "./helpers/game-db";

/**
 * T020 US3 通知域 E2E(quickstart S3.1/S3.2/S3.6):
 * 注册→激活即登录→header 徽标=1(注册奖励)→收件箱见「积分入账 +2」
 * →全部已读→徽标清零;admin 手调 +50→page.clock 快进 60s 轮询→弹泡出现。
 * 五类事件内容/事务性/阈值邮件主断言在集成层 notification.test.ts。
 */
const RUN = Date.now().toString(36);
const USERNAME = `e2nt${RUN}`;
const EMAIL = `${USERNAME}@test.local`;
const PASSWORD = "E2ePass123";

const prisma = getPrisma();

async function fetchActivateToken(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const list = await request.get("http://localhost:8025/api/v1/messages");
    const data = (await list.json()) as {
      messages?: { ID: string; To?: { Address?: string }[] }[];
    };
    const hit = (data.messages ?? []).find((m) =>
      (m.To ?? []).some((t) => t.Address?.toLowerCase() === email),
    );
    if (hit) {
      const full = (await (
        await request.get(`http://localhost:8025/api/v1/message/${hit.ID}`)
      ).json()) as { Text?: string; HTML?: string };
      const token = (full.Text ?? full.HTML ?? "").match(
        /token=([A-Za-z0-9_-]+)/,
      )?.[1];
      if (token) return token;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("激活邮件未在 Mailpit 中出现");
}

test.afterAll(async () => {
  const user = await prisma.user.findUnique({
    where: { username: USERNAME },
    select: { id: true },
  });
  if (user) {
    await prisma.userToken.deleteMany({ where: { userId: user.id } });
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.mailOutbox.deleteMany({ where: { relatedUserId: user.id } });
    await prisma.pointTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$executeRaw`
    DELETE FROM acore_auth.account WHERE username = ${USERNAME.toUpperCase()}
  `;
  await prisma.$disconnect();
});

test.describe("US3 通知域(quickstart S3)", () => {
  test("注册→徽标=1→收件箱见注册奖励→全部已读→徽标清零→手调弹泡", async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    await page.clock.install();

    // 注册→激活即登录(register.spec 全链路复用,此处只走通路径)
    await page.goto("/register");
    await page.getByLabel("用户名").fill(USERNAME);
    await page.getByLabel("邮箱").fill(EMAIL);
    await page.getByRole("button", { name: "发送激活邮件" }).click();
    await expect(page.locator("p[role=status]")).toContainText("注册受理成功");
    const token = await fetchActivateToken(request, EMAIL);
    await page.goto(`/register/set-password?token=${token}`);
    await page.getByLabel(/^密码/).fill(PASSWORD);
    await page.getByLabel("确认密码").fill(PASSWORD);
    await page.getByRole("button", { name: "设置密码并激活" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);

    // 徽标:注册奖励 +2 → 未读 1
    await expect(page.getByTestId("unread-count")).toHaveText("1");

    // 收件箱:注册奖励通知内容+余额快照
    await page.goto("/account/notifications");
    const item = page.getByTestId("inbox-item").first();
    await expect(item).toContainText("积分入账 +2");
    await expect(item).toContainText("注册奖励");
    await expect(item).toContainText("当前余额 2");
    await expect(page.getByTestId("inbox-unread")).toContainText("未读 1 条");

    // 全部已读 → 本地未读清零+徽标消失(0 不渲染数字)
    await page.getByTestId("mark-all-read").click();
    await expect(page.getByTestId("inbox-unread")).toContainText("未读 0 条");
    await expect(page.getByTestId("unread-count")).toHaveCount(0);

    // admin 手调 +50 → 快进 60s 触发轮询 → 弹泡(S3.2)
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminPage.goto("/login");
    await adminPage.getByLabel("用户名").fill("m1admin");
    await adminPage.getByLabel("密码", { exact: true }).fill("adminpass123");
    await adminPage.getByRole("button", { name: "登录" }).click();
    await expect(adminPage).toHaveURL(/\/account\/overview$/);
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: USERNAME },
      select: { id: true },
    });
    const adjust = await adminPage.request.post(
      `/api/admin/users/${user.id}/points-adjust`,
      { data: { amount: 50, reason: "E2E 通知弹泡手调" } },
    );
    expect(adjust.status()).toBe(200);

    await page.clock.fastForward(60_000);
    const toast = page.getByTestId("unread-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("1 条新通知");
    await toast.click();
    await expect(page).toHaveURL(/\/account\/notifications$/);
    await expect(page.getByTestId("inbox-item").first()).toContainText(
      "积分入账 +50",
    );
    await adminCtx.close();
  });
});
