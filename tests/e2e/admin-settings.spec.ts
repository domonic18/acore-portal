import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { reloadServerConfig } from "./helpers/config-reload";

/**
 * M4 US5 系统设置 E2E(T032,quickstart S5.1-S5.3 简版自动化,主链路在集成层):
 * ① 权限口径:游客/user 访问 /admin/settings → 登录页;
 * ② 八组渲染+NAV 入口+敏感字段掩码态(已配置显「已配置,留空保持」,不回显明文);
 * ③ 保存校验:非法值 422 错误回显;合法保存「已保存,即时生效」;
 * ④ 测试发信:正常配置 → Mailpit 收到;坏 SMTP 配置热生效后 → 页面回显失败摘要。
 * smtp 键为全局行:用前快照、用后还原;E2E schema 指向 dev Mailpit(localhost:1025)。
 */
const prisma = new PrismaClient();
const SMTP_KEYS = ["smtp.host", "smtp.port", "smtp.user", "smtp.password", "smtp.from"];
const SECURITY_KEYS = ["security.loginMaxFails", "security.loginWindowSec", "security.loginLockSec"];
const SITE_KEYS = ["site.icp", "site.copyrightEn", "site.qqGroup", "site.qqGroupQr", "site.qqGroupJoinUrl"];
const CONTENT_KEYS = ["content.tocEnabled"];
const APPEARANCE_KEYS = [
  "appearance.logoUrl",
  "appearance.faviconUrl",
  "appearance.headerBackgroundUrl",
  "appearance.pageBackgroundUrl",
];
const THEME_KEYS = [
  "theme.active",
  "theme.tbc.headerBackgroundUrl",
  "theme.tbc.pageBackgroundUrl",
  "theme.tbc.panelBackgroundUrl",
  "theme.wlk.headerBackgroundUrl",
  "theme.wlk.pageBackgroundUrl",
  "theme.wlk.panelBackgroundUrl",
];
const SMTP_SECRET = `e2e-secret-${Date.now().toString(36)}`;
const TEST_TO = `e2e-testmail-${Date.now().toString(36)}@lokta.local`;
const MAILPIT_API = "http://127.0.0.1:8025";

let smtpBackup: { key: string; value: string }[] = [];
let securityBackup: { key: string; value: string }[] = [];
let siteBackup: { key: string; value: string }[] = [];
let contentBackup: { key: string; value: string }[] = [];
let appearanceBackup: { key: string; value: string }[] = [];
let themeBackup: { key: string; value: string }[] = [];
// admin 会话 access token:还原库后用于触发服务端 config 快照重载
let adminToken = "";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
  if (username === "m1admin") {
    const cookies = await page.context().cookies();
    adminToken = cookies.find((c) => c.name === "ap_access")?.value ?? "";
  }
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
  siteBackup = await prisma.systemConfig.findMany({
    where: { key: { in: SITE_KEYS } },
    select: { key: true, value: true },
  });
  contentBackup = await prisma.systemConfig.findMany({
    where: { key: { in: CONTENT_KEYS } },
    select: { key: true, value: true },
  });
  appearanceBackup = await prisma.systemConfig.findMany({
    where: { key: { in: APPEARANCE_KEYS } },
    select: { key: true, value: true },
  });
  themeBackup = await prisma.systemConfig.findMany({
    where: { key: { in: THEME_KEYS } },
    select: { key: true, value: true },
  });
});

test.afterAll(async () => {
  await prisma.systemConfig.deleteMany({
    where: {
      key: {
        in: [
          ...SMTP_KEYS,
          ...SECURITY_KEYS,
          ...SITE_KEYS,
          ...APPEARANCE_KEYS,
          ...CONTENT_KEYS,
          ...THEME_KEYS,
        ],
      },
    },
  });
  const restore = [
    ...smtpBackup,
    ...securityBackup,
    ...siteBackup,
    ...appearanceBackup,
    ...contentBackup,
    ...themeBackup,
  ];
  if (restore.length > 0) {
    await prisma.systemConfig.createMany({ data: restore });
  }
  // 库已还原,但服务端 config 是进程级快照(只随 reloadSystemConfig 更新)——
  // 不重载则 E2E 写入的值仍留在进程里,污染后续用例的页脚/主题断言
  if (adminToken) {
    await reloadServerConfig(adminToken);
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
  test("八组渲染+NAV 入口+掩码态不回显明文", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");

    // /admin 主区自带 <nav> 卡片网格,布局导航在 <header>(banner)内,须双重限定
    await expect(
      page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "设置" }),
    ).toHaveAttribute("href", "/admin/settings");
    await page.goto("/admin/settings");

    for (const group of ["smtp", "captcha", "security", "notify", "content", "site", "appearance", "theme"]) {
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

  test("site 组保存 → 页脚/侧栏 QQ 卡即时生效", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    // site 组:备案号+英文版权声明 → 页脚;QQ 群号+二维码 → 首页侧栏卡
    const icp = `京ICP备E2E${Date.now().toString(36)}号`;
    await page.getByTestId("settings-field-site-icp").fill(icp);
    await page.getByTestId("settings-field-site-copyrightEn").fill("E2E copyright line.");
    await page.getByTestId("settings-field-site-qqGroup").fill("88888888");
    await page.getByTestId("settings-field-site-qqGroupQr").fill("/favicon-192.png");
    await page.getByTestId("settings-field-site-qqGroupJoinUrl").fill("https://qm.qq.com/q/e2ejoinkey");
    await page.getByTestId("settings-save-site").click();
    await expect(page.getByTestId("settings-result-site")).toContainText("已保存");
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText(icp);
    await expect(footer).toContainText("E2E copyright line.");
    // QQ 群展示与 Powered by AzerothCore 已随 2026-11-05 页脚文案调整下线
    await expect(footer).not.toContainText("QQ 群");
    await expect(footer).not.toContainText("AzerothCore");
    // 侧栏 QQ 交流群卡:群号+二维码即时生效(复用内置静态图占位二维码)
    const qqCard = page.getByTestId("site-sidebar").getByTestId("sidebar-qq-group");
    await expect(qqCard.getByTestId("sidebar-qq-group-number")).toHaveText("88888888");
    await expect(qqCard.getByTestId("sidebar-qq-group-qr")).toHaveAttribute(
      "src",
      "/favicon-192.png",
    );
    // 加群链接即时生效:群号渲染为超链接直达加群页(issue #95)
    await expect(qqCard.getByTestId("sidebar-qq-group-join")).toHaveAttribute(
      "href",
      "https://qm.qq.com/q/e2ejoinkey",
    );
  });

  test("appearance 组保存 → 页头 logo 即时生效", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    await page.getByTestId("settings-field-appearance-logoUrl").fill("/favicon-192.png");
    await page.getByTestId("settings-save-appearance").click();
    await expect(page.getByTestId("settings-result-appearance")).toContainText("已保存");

    await page.goto("/");
    await expect(
      page.getByRole("banner").locator('img[alt="老克塔"]'),
    ).toHaveAttribute("src", "/favicon-192.png");
  });

  test("theme 组:切到 WLK → 首页落地 data-theme=wlk;切回 TBC 恢复", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    await page.getByTestId("settings-field-theme-active-wlk").check();
    await page.getByTestId("settings-save-theme").click();
    await expect(page.getByTestId("settings-result-theme")).toContainText("已保存");
    const row = await prisma.systemConfig.findUnique({
      where: { key: "theme.active" },
      select: { value: true },
    });
    expect(row?.value).toBe("wlk");

    // 热生效:刷新即换主题(渲染链路读 system_config,不需重启)
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "wlk");

    await page.goto("/admin/settings");
    await page.getByTestId("settings-field-theme-active-tbc").check();
    await page.getByTestId("settings-save-theme").click();
    await expect(page.getByTestId("settings-result-theme")).toContainText("已保存");
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "tbc");
  });

  test("content 组:目录开关关闭 → 文章/静态页目录消失,重开恢复", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");

    // 键缺省默认开:开关呈开态
    const tocSwitch = page.getByTestId("settings-field-content-tocEnabled");
    await expect(tocSwitch).toHaveAttribute("aria-checked", "true");
    await tocSwitch.click();
    await page.getByTestId("settings-save-content").click();
    await expect(page.getByTestId("settings-result-content")).toContainText("已保存");

    // 关闭后有 h2 标题的正文不再渲染目录(左列与顶部回落块整块移除,栅格回落两栏)
    await page.goto("/post/seed-announcement-second");
    await expect(page.getByTestId("article-toc-rail")).toHaveCount(0);
    await expect(page.getByTestId("article-toc-top")).toHaveCount(0);
    await page.goto("/tutorial");
    await expect(page.getByTestId("article-toc-rail")).toHaveCount(0);

    // 重开 → 目录恢复
    await page.goto("/admin/settings");
    await page.getByTestId("settings-field-content-tocEnabled").click();
    await page.getByTestId("settings-save-content").click();
    await expect(page.getByTestId("settings-result-content")).toContainText("已保存");
    await page.goto("/post/seed-announcement-second");
    await expect(page.getByTestId("article-toc-rail")).toBeVisible();
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
