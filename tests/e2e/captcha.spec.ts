import { expect, test } from "@playwright/test";

/**
 * 人机校验 E2E(腾讯云验证码 TCaptcha,2026-11-07 由 Turnstile 替换):
 * - 关态(默认):登录/注册页无控件,直通;
 * - 开态(E2E_CAPTCHA=1):控件出现、未拿到票据时提交按钮禁用、
 *   服务端对无票据请求一律 422 CAPTCHA_FAILED。
 *
 * 口径说明:腾讯云验证码**没有官方测试密钥**(不同于 Turnstile 的 1x…AA),
 * 「真票据通过」只能用真实 CaptchaAppId + AppSecretKey + 云API SecretId/SecretKey 联调,
 * CI 不覆盖该路径;开态档因此只跑本专项(见 playwright.config.ts 的 testMatch)。
 * 计数/锁定/文案主断言在集成层 auth-m4.test.ts,这里走真实浏览器路径。
 */
const CAPTCHA_ON = process.env.E2E_CAPTCHA === "1";

test.describe("人机校验关态直通", () => {
  test.skip(() => CAPTCHA_ON, "仅关态档运行");

  test("登录页无控件,登录直通成功", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("captcha-trigger")).toHaveCount(0);

    await page.getByLabel("用户名").fill("bcryptuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass456");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
  });

  test("注册页无控件,受理成功", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("captcha-trigger")).toHaveCount(0);

    const username = `cap_off_${Date.now().toString(36)}`;
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("邮箱").fill(`${username}@e2e.local`);
    await page.getByRole("button", { name: "发送激活邮件" }).click();
    await expect(page.getByRole("status")).toContainText("注册受理成功");
  });
});

test.describe("人机校验开态", () => {
  test.skip(() => !CAPTCHA_ON, "仅开态档运行(E2E_CAPTCHA=1)");

  test("登录页渲染控件,未拿到票据时提交按钮禁用", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("captcha-trigger")).toBeVisible();
    await expect(page.getByRole("button", { name: "登录" })).toBeDisabled();
  });

  test("服务端对无票据登录一律 422 CAPTCHA_FAILED", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { username: "bcryptuser", password: "oldpass456" },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CAPTCHA_FAILED");
  });

  test("注册页渲染控件,服务端对无票据注册 422", async ({ page, request }) => {
    await page.goto("/register");
    await expect(page.getByTestId("captcha-trigger")).toBeVisible();
    const res = await request.post("/api/auth/register", {
      data: { username: `cap_on_${Date.now().toString(36)}`, email: "cap_on@e2e.local" },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CAPTCHA_FAILED");
  });
});
