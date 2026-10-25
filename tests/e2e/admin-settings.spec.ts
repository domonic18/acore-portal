import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * M4 US5 系统设置 E2E(T032,quickstart S5.1-S5.3 简版自动化,主链路在集成层):
 * ① 权限口径:游客/user 访问 /admin/settings → 登录页;
 * ② 五组渲染+NAV 入口+敏感字段掩码态(已配置显「已配置,留空保持」,不回显明文);
 * ③ 保存校验:非法值 422 错误回显;合法保存「已保存,即时生效」;
 * ④ 测试发信:正常配置 → Mailpit 收到;坏 SMTP 配置热生效后 → 页面回显失败摘要。
 * smtp 键为全局行:用前快照、用后还原;E2E schema 指向 dev Mailpit(localhost:1025)。
 */
const prisma = new PrismaClient();
const SMTP_KEYS = ["smtp.host", "smtp.port", "smtp.user", "smtp.password", "smtp.from"];
const SECURITY_KEYS = ["security.loginMaxFails", "security.loginWindowSec", "security.loginLockSec"];
const SMTP_SECRET = `e2e-secret-${Date.now().toString(36)}`;
const TEST_TO = `e2e-testmail-${Date.now().toString(36)}@lokta.local`;
const MAILPIT_API = "http://127.0.0.1:8025";

let smtpBackup: { key: string; value: string }[] = [];
let securityBackup: { key: string; value: string }[] = [];

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  smtpBackup = await prisma.systemConfig.findMany({
    where: { key: { in: SMTP_KEYS } },
    select: { key: true, value: true },
  });
  securityBackup = await prisma.systemConfig.findMany({
    where: { key: { in: SECURITY_KEYS } },
    select: { key: true, value: true },
  });
});

test.afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: [...SMTP_KEYS, ...SECURITY_KEYS] } } });
  const restore = [...smtpBackup, ...securityBackup];
  if (restore.length > 0) {
    await prisma.systemConfig.createMany({ data: restore });
  }
  await prisma.$disconnect();
});

test("游客访问 /admin/settings → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsettings/);
});

test("user 角色 → 同样拦截(非 admin)", async ({ page }) => {
  await login(page, "legacyuser", "oldpass123");
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsettings/);
});

test.describe.serial("admin 设置页", () => {
  test("五组渲染+NAV 入口+掩码态不回显明文", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");

    // /admin 主区自带 <nav> 卡片网格,布局导航在 <header>(banner)内,须双重限定
    await expect(
      page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "设置" }),
    ).toHaveAttribute("href", "/admin/settings");
    await page.goto("/admin/settings");

    for (const group of ["smtp", "turnstile", "security", "notify", "umami"]) {
      await expect(page.getByTestId(`settings-group-${group}`)).toBeVisible();
    }
    // 服务端 config 是进程级快照:经 UI 保存密码触发 reloadSystemConfig 后,
    // 重渲染的表单才进入「已配置」掩码态(顺带验证保存闭环)
    const pwdField = page.getByTestId("settings-field-smtp-password");
    await expect(pwdField).toHaveAttribute("type", "password");
    await expect(pwdField).toHaveAttribute("placeholder", "未配置");
    await pwdField.fill(SMTP_SECRET);
    await page.getByTestId("settings-save-smtp").click();
    await expect(page.getByTestId("settings-result-smtp")).toContainText("已保存");
    await expect(pwdField).toHaveAttribute("placeholder", "已配置,留空保持");
    // 掩码红线:页面任何位置不出现明文
    const html = await page.content();
    expect(html).not.toContain(SMTP_SECRET);
  });

  test("保存校验:非法值 422 回显;合法保存即时生效", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    // 清空 host → 422 VALIDATION_FAILED 错误回显
    const host = page.getByTestId("settings-field-smtp-host");
    await host.fill("");
    await page.getByTestId("settings-save-smtp").click();
    await expect(page.getByTestId("settings-result-smtp")).toContainText("参数错误");
    // 安全恢复 host,避免污染后续用例
    await host.fill("localhost");

    // security 组合法保存 → 成功提示;值实际落库(热生效经集成层覆盖,这里看 UI 闭环)
    const maxFails = page.getByTestId("settings-field-security-loginMaxFails");
    await maxFails.fill("7");
    await page.getByTestId("settings-save-security").click();
    await expect(page.getByTestId("settings-result-security")).toContainText("已保存");
    const row = await prisma.systemConfig.findUnique({
      where: { key: "security.loginMaxFails" },
      select: { value: true },
    });
    expect(row?.value).toBe("7");
    await maxFails.fill("5");
    await page.getByTestId("settings-save-security").click();
    await expect(page.getByTestId("settings-result-security")).toContainText("已保存");
  });

  test("测试发信:Mailpit 收到;坏配置热生效后回显失败摘要", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    // 正常配置(E2E schema: localhost:1025 → dev Mailpit)直发成功
    await page.getByTestId("settings-testmail-to").fill(TEST_TO);
    await page.getByTestId("settings-testmail-run").click();
    await expect(page.getByTestId("settings-testmail-result")).toContainText("已发送");

    const res = await fetch(`${MAILPIT_API}/api/v1/messages?search=${encodeURIComponent(TEST_TO)}`);
    expect(res.ok).toBe(true);
    const box = (await res.json()) as { messages?: { Subject?: string; To?: { Address?: string }[] }[] };
    const hit = box.messages?.find((m) => (m.To ?? []).some((t) => t.Address === TEST_TO));
    expect(hit).toBeDefined();
    expect(hit?.Subject).toContain("测试发信");

    // 填坏 SMTP(端口 1)保存 → 热生效(reloadSystemConfig,无需重启)→ 测试发信失败摘要回显
    await page.getByTestId("settings-field-smtp-host").fill("127.0.0.1");
    await page.getByTestId("settings-field-smtp-port").fill("1");
    await page.getByTestId("settings-save-smtp").click();
    await expect(page.getByTestId("settings-result-smtp")).toContainText("已保存");

    await page.getByTestId("settings-testmail-run").click();
    await expect(page.getByTestId("settings-testmail-result")).toContainText("发送失败");

    // 还原 SMTP 配置(host=localhost port=1025)
    await page.getByTestId("settings-field-smtp-host").fill("localhost");
    await page.getByTestId("settings-field-smtp-port").fill("1025");
    await page.getByTestId("settings-save-smtp").click();
    await expect(page.getByTestId("settings-result-smtp")).toContainText("已保存");
  });
});
