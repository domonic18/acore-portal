import { expect, test } from "@playwright/test";

/**
 * T013 US2 Turnstile E2E(两档运行,global-setup 按 E2E_TURNSTILE 播配置):
 * - 关态(默认):登录/注册页无 widget 节点,登录直通
 * - 开态(E2E_TURNSTILE=1 + 测试密钥 1x…AA):widget iframe 渲染,
 *   自动通过,登录/注册全链路成功
 * 计数/锁定/文案主断言在集成层 auth-m4.test.ts,这里走真实浏览器路径。
 */
const TS_ON = process.env.E2E_TURNSTILE === "1";
// 测试站点键(1x…AA)为隐形自动通过模式:无可见挑战 iframe,token 落隐藏域
const TOKEN_INPUT = "[name=cf-turnstile-response]";

test.describe("Turnstile 关态直通", () => {
  test.skip(() => TS_ON, "仅关态档运行");

  test("登录页无 widget,登录直通成功", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("turnstile-widget")).toHaveCount(0);
    await expect(page.locator(TOKEN_INPUT)).toHaveCount(0);

    await page.getByLabel("用户名").fill("bcryptuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass456");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
  });

  test("注册页无 widget,受理成功", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("turnstile-widget")).toHaveCount(0);

    const username = `ts_off_${Date.now().toString(36)}`;
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("邮箱").fill(`${username}@e2e.local`);
    await page.getByRole("button", { name: "发送激活邮件" }).click();
    await expect(page.getByRole("status")).toContainText("注册受理成功");
  });
});

test.describe("Turnstile 开态渲染", () => {
  test.skip(() => !TS_ON, "仅开态档运行(E2E_TURNSTILE=1)");

  test("登录页渲染 widget,自动通过后登录成功", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("turnstile-widget")).toBeVisible();
    // token 到位后提交按钮解禁(表单在开态下禁用提交直至 token 就绪)
    await expect(page.locator(TOKEN_INPUT)).not.toHaveValue("");

    await page.getByLabel("用户名").fill("bcryptuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass456");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
  });

  test("注册页渲染 widget,带 token 受理成功", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByTestId("turnstile-widget")).toBeVisible();
    await expect(page.locator(TOKEN_INPUT)).not.toHaveValue("");

    const username = `ts_on_${Date.now().toString(36)}`;
    await page.getByLabel("用户名").fill(username);
    await page.getByLabel("邮箱").fill(`${username}@e2e.local`);
    await page.getByRole("button", { name: "发送激活邮件" }).click();
    await expect(page.getByRole("status")).toContainText("注册受理成功");
  });
});
