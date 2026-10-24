import { expect, test, type Page } from "@playwright/test";

/**
 * T020 US1 全局框架(quickstart S1,SC-205):
 * 游客/登录双菜单互斥(FR-201)+多级结构(FR-202)+移动汉堡折叠(FR-205)+
 * 页脚链接(FR-204)+侧栏按类型渲染与积分余额组件登录态门槛(FR-206)。
 */

const GUEST_TOP = [
  "首页",
  "项目简介",
  "使用教程",
  "公告",
  "数据库",
  "资讯",
  "论坛",
  "积分商店",
];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.describe("游客菜单(FR-201)", () => {
  test("顶级菜单无我的帐户,登录/注册入口可见", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    for (const label of GUEST_TOP) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(nav.getByText("我的帐户", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "登录" })).toBeVisible();
    await expect(page.getByRole("link", { name: "注册" })).toBeVisible();
  });

  test("公告▾ 多级下拉子项可见(FR-202)", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await nav.getByText("公告", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "开发日志" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "渐进计划" })).toBeVisible();
    // M4 占位:封号记录不可点击跳转,带即将开放标记
    await expect(nav.getByText("封号记录")).toBeVisible();
    await expect(nav.getByText("即将开放").first()).toBeVisible();
  });

  test("页脚协议/公约链接(FR-204)", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "用户协议" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "论坛公约" })).toBeVisible();
  });

  test("侧栏 home 清单渲染,游客无积分余额组件(FR-206)", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByTestId("site-sidebar");
    await expect(
      sidebar.getByTestId("sidebar-站内搜索"),
    ).toBeVisible();
    await expect(
      sidebar.getByTestId("sidebar-announcement-banners"),
    ).toBeVisible();
    await expect(
      sidebar.getByTestId("sidebar-external-links"),
    ).toBeVisible();
    await expect(
      sidebar.getByTestId("sidebar-calendar-archive"),
    ).toBeVisible();
    await expect(sidebar.getByTestId("sidebar-points-balance")).toHaveCount(0);
  });

  test("375px 汉堡折叠展开全层级(FR-205)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const button = page.getByTestId("mobile-menu-button");
    const menu = page.getByTestId("mobile-menu");
    await expect(menu).toHaveCount(0);
    await button.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByText("积分商店", { exact: true })).toBeVisible();
    // 登录态前游客折叠菜单同样无我的帐户
    await expect(menu.getByText("我的帐户", { exact: true })).toHaveCount(0);
    await button.click();
    await expect(menu).toHaveCount(0);
  });
});

test.describe("登录菜单(FR-201)", () => {
  test("我的帐户▾ 仅登录态可见,子项购物车/结账", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await expect(nav.getByText("我的帐户", { exact: true })).toBeVisible();
    await nav.getByText("我的帐户", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "购物车" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "结账" })).toBeVisible();
    // 登录后页头登录/注册入口退位
    await expect(page.getByRole("link", { name: "注册" })).toHaveCount(0);
  });

  test("登录态侧栏出现积分余额组件(FR-206)", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const sidebar = page.getByTestId("site-sidebar");
    await expect(sidebar.getByTestId("sidebar-points-balance")).toBeVisible();
    await expect(
      sidebar.getByTestId("sidebar-points-balance").getByRole("link"),
    ).toHaveText("积分明细 →");
  });
});
