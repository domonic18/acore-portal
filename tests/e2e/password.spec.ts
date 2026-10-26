import Redis from "ioredis";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { sha256Hex, srp6MakeRegistrationData } from "../../src/lib/auth/game-hash";
import { hashWpBcrypt } from "../../src/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO } from "../../src/constants/password";
import { getAuthClient, getPrisma } from "./helpers/game-db";

/**
 * T038 US3 密码 E2E(quickstart S3):
 * ①登录态改密→旧会话全吊销→新密重登;②找回→Mailpit 收信→30min 链接重置→一次性复用失效。
 * 自建隔离用户(不污染 seed 账号),用后双侧清理;找回限速门按服务同款 key 清除。
 * 游戏端播种走 e2e helper(连接串来自 system_config)。
 */
const RUN = Date.now().toString(36);
const USERNAME = `e2epw${RUN}`;
const EMAIL = `${USERNAME}@test.local`;
const OLD_PASS = "oldpass456";

const prisma = getPrisma();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6381/0");

async function clearResetGate(email: string) {
  const base = `rl:pwreset:${sha256Hex(email).slice(0, 24)}`;
  await redis.del(`${base}:60s`, `${base}:day`);
}

/** 轮询 Mailpit,取重置邮件里的 token */
async function fetchResetToken(
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
  throw new Error("重置邮件未在 Mailpit 中出现");
}

async function login(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(USERNAME);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function changePassword(
  page: import("@playwright/test").Page,
  current: string,
  next: string,
) {
  await page.goto("/account/settings");
  // 页面同时有改密/换邮箱两个表单,都有「当前密码」,按标题收窄
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "修改密码" }) });
  await form.getByLabel("当前密码").fill(current);
  await form.getByLabel(/^新密码/).fill(next);
  // 以 POST 200 为准(成功后 1.5s 跳登录页,提示语短暂;dev HMR 亦可能打断)
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/account/change-password")),
    form.getByRole("button", { name: "修改密码" }).click(),
  ]);
  expect(res.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
}

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      username: USERNAME,
      email: EMAIL,
      passwordHash: hashWpBcrypt(OLD_PASS),
      passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
    },
  });
  const reg = srp6MakeRegistrationData(USERNAME, OLD_PASS);
  await (
    await getAuthClient()
  ).account.create({
    data: {
      username: USERNAME.toUpperCase(),
      email: EMAIL,
      salt: Buffer.from(reg.salt, "hex"),
      verifier: Buffer.from(reg.verifier, "hex"),
    },
  });
  await clearResetGate(EMAIL);
});

test.afterAll(async () => {
  await prisma.userToken.deleteMany({
    where: { user: { username: USERNAME } },
  });
  await prisma.mailOutbox.deleteMany({ where: { toEmail: EMAIL } });
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  // writer 无 DELETE(R5);业务账号有全库权限,跨库清理
  await prisma.$executeRaw`
    DELETE FROM acore_auth.account WHERE username = ${USERNAME.toUpperCase()}
  `;
  await prisma.$disconnect();
  await redis.quit();
});

test.describe("US3 密码(quickstart S3)", () => {
  test("登录态改密 → 旧会话吊销 → 新密重登(会话恢复原密)", async ({ page }) => {
    await login(page, OLD_PASS);
    await changePassword(page, OLD_PASS, "E2ENew123");

    // 旧会话已吊销:受保护页重定向登录
    await page.goto("/account/overview");
    await expect(page).toHaveURL(/\/login/);

    // 新密可重登
    await login(page, "E2ENew123");

    // 还原为初始密码(供后续用例/重复运行)
    await changePassword(page, "E2ENew123", OLD_PASS);
  });

  test("找回:申请 → Mailpit 收信 → 链接重置 → 一次性复用失效", async ({
    page,
    request,
  }) => {
    await clearResetGate(EMAIL);
    await page.goto("/forgot-password");
    await page.getByLabel("注册邮箱").fill(EMAIL);
    await page.getByRole("button", { name: "发送重置邮件" }).click();
    // 恒定文案,不泄露邮箱存在性
    await expect(page.locator("p[role=status]")).toContainText("若该邮箱已注册");

    const token = await fetchResetToken(request, EMAIL);
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel(/^新密码/).fill("E2EReset123");
    await page.getByLabel("确认新密码").fill("E2EReset123");
    await page.getByRole("button", { name: "设置新密码" }).click();
    await expect(page.locator("p[role=status]")).toContainText("密码已重置");

    // 新密可登录
    await login(page, "E2EReset123");

    // 同一链接复用 → invalid_token
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel(/^新密码/).fill("Again12345");
    await page.getByLabel("确认新密码").fill("Again12345");
    await page.getByRole("button", { name: "设置新密码" }).click();
    await expect(page.locator("p[role=alert]")).toContainText("链接无效或已过期");

    // 还原为初始密码
    await changePassword(page, "E2EReset123", OLD_PASS);
  });
});
