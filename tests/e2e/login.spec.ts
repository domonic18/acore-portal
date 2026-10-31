import { expect, test } from "@playwright/test";

/**
 * T022 US1 登录 E2E(quickstart S2):
 * seed 账号 legacyuser(phpass→透明升级)/bcryptuser($wp$ 零接触)/统一失败语义。
 * 前置:pnpm db:seed 已执行;服务端登录语义已被集成测试覆盖,这里走真实浏览器路径。
 */

test.describe("US1 登录 MVP", () => {
  test("phpass 存量账号登录成功 → 跳转账号总览(并触发透明升级)", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill("legacyuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass123");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL(/\/account\/overview$/);
    await expect(
      page.getByRole("heading", { name: "账号总览" }),
    ).toBeVisible();
  });

  test("$wp$ 存量账号登录成功(零接触路径)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill("bcryptuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass456");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page).toHaveURL(/\/account\/overview$/);
  });

  test("错误密码 → 统一失败语义(不泄露账号存在性)", async ({ page }) => {
    await page.goto("/login");
    // 不存在用户名:与真实账号 401 文案逐字一致(集成层已断言),
    // 且避免向共享 Redis 累计真实账号的失败计数(M4 连错锁定会误伤后续运行)
    await page.getByLabel("用户名").fill(`nouser_${Date.now().toString(36)}`);
    await page.getByLabel("密码", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "登录" }).click();

    await expect(page.locator("p[role=alert]")).toContainText(
      "用户名或密码错误",
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test("未登录访问受保护页 → 重定向登录并带 next", async ({ page }) => {
    await page.goto("/account/overview");
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Foverview$/);
  });

  test("记住登录勾选 → 下发 refresh cookie", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill("bcryptuser");
    await page.getByLabel("密码", { exact: true }).fill("oldpass456");
    await page.getByLabel(/记住登录/).check();
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/auth/login")),
      page.getByRole("button", { name: "登录" }).click(),
    ]);
    expect(res.status()).toBe(200);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "ap_refresh")).toBeDefined();
  });
});
