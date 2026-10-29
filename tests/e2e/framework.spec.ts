import { expect, test, type Page } from "@playwright/test";

/**
 * T020 US1 全局框架(quickstart S1,SC-205):
 * 游客/登录双菜单互斥(FR-201)+多级结构(FR-202)+移动汉堡折叠(FR-205)+
 * 页脚链接(FR-204)+侧栏按类型渲染与积分余额组件登录态门槛(FR-206)。
 * 首页 2026-10 调整:站内搜索/公告动态/友情链接/日历归档/最近浏览全站下线,
 * 公告/商品/服务器状态/当前阶段移入首页右栏(区块断言在 content.spec)。
 * 导航 2026-10 与 ardot 设计稿 p01-s3 对齐:游客=首页/公告/数据库/论坛/资讯,
 * 登录态追加 积分商店▾(购物车/结账)+我的账户;项目简介/使用教程走快捷入口与页脚。
 */

const GUEST_TOP = ["首页", "公告", "数据库", "论坛", "资讯"];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.describe("游客菜单(FR-201)", () => {
  test("顶级菜单结构对齐设计稿,商城/账户入口不出现,登录/注册入口可见", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    for (const label of GUEST_TOP) {
      await expect(nav.getByText(label, { exact: true })).toBeVisible();
    }
    // 商城与账户入口仅登录态;项目简介/使用教程走快捷入口+页脚,不占顶级导航
    for (const label of ["积分商店", "我的账户", "项目简介", "使用教程"]) {
      await expect(nav.getByText(label, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: "登 录" })).toBeVisible();
    await expect(page.getByRole("link", { name: "注 册" })).toBeVisible();
  });

  test("公告▾ 多级下拉子项可见(FR-202)", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await nav.getByText("公告", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "开发日志" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "渐进计划" })).toBeVisible();
    // M4 US1 接线:封号记录指向工具页真路由
    await expect(nav.getByRole("link", { name: "封号记录" })).toHaveAttribute(
      "href",
      "/banlist",
    );
  });

  test("页脚协议/公约链接(FR-204)", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "用户协议" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "论坛公约" })).toBeVisible();
    // 设计稿口径:项目简介/使用教程经页脚可达
    await expect(footer.getByRole("link", { name: "项目简介" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "使用教程" })).toBeVisible();
  });

  test("侧栏下线组件不渲染,游客无积分余额组件(FR-206)", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByTestId("site-sidebar");
    for (const id of [
      "sidebar-站内搜索",
      "sidebar-announcement-banners",
      "sidebar-external-links",
      "sidebar-calendar-archive",
      "sidebar-recent-products",
    ]) {
      await expect(sidebar.getByTestId(id)).toHaveCount(0);
    }
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
    await expect(menu.getByText("公告", { exact: true })).toBeVisible();
    // 游客折叠菜单无商城/账户入口(设计稿 LoginMenu 口径:登录态才出现)
    await expect(menu.getByText("积分商店", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("我的账户", { exact: true })).toHaveCount(0);
    await button.click();
    await expect(menu).toHaveCount(0);
  });
});

test.describe("登录菜单(FR-201)", () => {
  test("积分商店▾/我的账户 仅登录态可见,商店子项购物车/结账", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await expect(nav.getByText("积分商店", { exact: true })).toBeVisible();
    await expect(nav.getByText("我的账户", { exact: true })).toBeVisible();
    // 登录态页头积分余额 chip(设计稿 LoginMenu)
    await expect(page.getByTestId("header-points")).toContainText("积分");
    await nav.getByText("积分商店", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "购物车" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "结账" })).toBeVisible();
    // 登录后页头登录/注册入口退位
    await expect(page.getByRole("link", { name: "注 册" })).toHaveCount(0);
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
