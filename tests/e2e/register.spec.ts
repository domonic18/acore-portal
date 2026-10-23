import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient as AuthPrismaClient } from "../../src/generated/auth";
import { PrismaClient } from "../../src/generated/business";
import { gameShaPassHash } from "../../src/lib/auth/game-hash";
import { PENDING_HASH_PREFIX } from "../../src/constants/password";

/**
 * T032 US2 注册 E2E(quickstart S1,范围调整后无邀请码):
 * /register(无密码输入)→Mailpit 收激活邮件→设弱密码被拒→设合规密码→激活即登录;
 * 库内断言:$wp$ bcrypt/游戏端 SHA1 同密/积分 +2 且 SUM=balance。
 */
const RUN = Date.now().toString(36);
const USERNAME = `e2erg${RUN}`;
const EMAIL = `${USERNAME}@test.local`;
const PASSWORD = "E2ePass123";

const prisma = new PrismaClient();
const authClient = new AuthPrismaClient();

/** 轮询 Mailpit,取激活邮件里的 token */
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
    await prisma.pointTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: user.id } });
    await prisma.mailOutbox.deleteMany({ where: { relatedUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$executeRaw`
    DELETE FROM acore_auth.account WHERE username = ${USERNAME.toUpperCase()}
  `;
  await prisma.$disconnect();
  await authClient.$disconnect();
});

test.describe("US2 注册(quickstart S1)", () => {
  test("注册→激活邮件→弱密码拒绝→设密→激活即登录→双端同密+积分+2", async ({
    page,
    request,
  }) => {
    // 注册受理(注册页无密码输入,FR-005)
    await page.goto("/register");
    await page.getByLabel("用户名").fill(USERNAME);
    await page.getByLabel("邮箱").fill(EMAIL);
    await page.getByRole("button", { name: "发送激活邮件" }).click();
    await expect(page.locator("p[role=status]")).toContainText("注册受理成功");

    const token = await fetchActivateToken(request, EMAIL);

    // 弱密码拒绝(8 位但无数字,穿透 HTML5 minLength 由服务端策略拒绝)
    await page.goto(`/register/set-password?token=${token}`);
    await page.getByLabel(/^密码/).fill("nodigitpassword");
    await page.getByLabel("确认密码").fill("nodigitpassword");
    await page.getByRole("button", { name: "设置密码并激活" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("字母和数字");

    // 合规密码 → 激活即登录
    await page.getByLabel(/^密码/).fill(PASSWORD);
    await page.getByLabel("确认密码").fill(PASSWORD);
    await page.getByRole("button", { name: "设置密码并激活" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
    await expect(
      page.getByRole("heading", { name: "账号总览" }),
    ).toBeVisible();

    // 库内断言:站点 $wp$ bcrypt、游戏端同密 SHA1、占位哈希已消失
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: USERNAME },
    });
    expect(user.passwordHash.startsWith("$wp$")).toBe(true);
    expect(user.passwordAlgo).toBe("bcrypt_wp");
    const game = await authClient.account.findFirst({
      where: { username: USERNAME.toUpperCase() },
    });
    expect(game?.shaPassHash).toBe(gameShaPassHash(USERNAME, PASSWORD));

    // 积分:余额 +2,SUM(amount)=balance(账本重算,宪法 III)
    const account = await prisma.pointAccount.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(account.balance).toBe(2);
    const agg = await prisma.pointTransaction.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    });
    expect(agg._sum.amount).toBe(account.balance);
    const reward = await prisma.pointTransaction.findFirstOrThrow({
      where: { userId: user.id, type: "register_reward" },
    });
    expect(reward.remark).toBe("注册奖励");
    expect(reward.balanceAfter).toBe(2);

    // 占位 PENDING 前缀不应再出现
    expect(user.passwordHash.startsWith(PENDING_HASH_PREFIX)).toBe(false);
  });
});
