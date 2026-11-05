import { expect, test, type Page } from "@playwright/test";

/**
 * T020 US1 全局框架(quickstart S1,SC-205):
 * 游客/登录双菜单互斥(FR-201)+多级结构(FR-202)+移动汉堡折叠(FR-205)+
 * 页脚链接(FR-204)+侧栏按类型渲染(FR-206;积分余额组件 2026-11-05 下线,积分入头像下拉)。
 * 首页 2026-10 调整:站内搜索/公告动态/友情链接/日历归档/最近浏览全站下线,
 * 公告/商品/服务器状态(含当前阶段)移入首页右栏(区块断言在 content.spec)。
 * 导航 2026-10 与 ardot 设计稿 p01-s3 对齐:游客=首页/公告/数据库/论坛/资讯,
 * 登录态追加 积分商店▾(购物车/结账)+我的账户;项目简介/使用教程走快捷入口与页脚。
 */

const GUEST_TOP = ["首页", "公告", "数据库", "资讯", "论坛"];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
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
    // 商城与账户入口仅登录态
    for (const label of ["积分商店", "我的账户"]) {
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

  test("首页▾ 二级菜单对齐原站(项目简介/教程/下载)", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    const labels = ["项目简介", "使用教程", "客户端下载", "登录器下载", "补丁下载"];
    // 折叠态只占 DOM 不可见,悬停首页后展开
    for (const label of labels) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeHidden();
    }
    await nav.getByText("首页", { exact: true }).hover();
    for (const label of labels) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await expect(
      nav.getByRole("link", { name: "项目简介", exact: true }),
    ).toHaveAttribute("href", "/about");
    // 下载三项沿用旧站锚点直达教程页对应下载区
    await expect(nav.getByRole("link", { name: "客户端下载", exact: true })).toHaveAttribute(
      "href",
      "/tutorial#client_download",
    );
    await expect(nav.getByRole("link", { name: "登录器下载", exact: true })).toHaveAttribute(
      "href",
      "/tutorial#login_download",
    );
    await expect(nav.getByRole("link", { name: "补丁下载", exact: true })).toHaveAttribute(
      "href",
      "/tutorial#patch_download",
    );
  });

  test("客户端下载菜单跳转教程页锚点(FR-202)", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await nav.getByText("首页", { exact: true }).hover();
    await nav.getByRole("link", { name: "客户端下载", exact: true }).click();
    await expect(page).toHaveURL(/\/tutorial#client_download$/);
    await expect(
      page.getByRole("heading", { name: "第三步： 下载客户端" }),
    ).toBeVisible();
    expect(await page.getByRole("heading", { name: "第三步： 下载客户端" }).evaluate((el) => el.id)).toBe(
      "client_download",
    );
  });

  test("页脚协议/公约链接(FR-204)+英文版权声明(WP 原版迁移)", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "用户协议" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "规范要求" })).toBeVisible();
    // 规范要求与首页快捷入口同口径(2026-11-05 原「论坛公约」入口改指网站规范文章)
    await expect(footer.getByRole("link", { name: "规范要求" })).toHaveAttribute(
      "href",
      "/post/网站规范",
    );
    // 设计稿口径:项目简介/使用教程经页脚可达
    await expect(footer.getByRole("link", { name: "项目简介" })).toBeVisible();
    await expect(footer.getByRole("link", { name: "使用教程" })).toBeVisible();
    // WP 原版页脚的暴雪商标免责声明逐字迁移(system_config site.copyrightEn)
    await expect(
      footer.getByText(/World of Warcraft® and Blizzard Entertainment®/),
    ).toBeVisible();
    await expect(footer.getByText(/in no way associated with or endorsed by/)).toBeVisible();
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

  test("375px 侧边抽屉展开全层级(FR-205);二级菜单手风琴默认折叠(#56);遮罩点击关闭", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const button = page.getByTestId("mobile-menu-button");
    const menu = page.getByTestId("mobile-menu");
    const backdrop = page.getByTestId("mobile-menu-backdrop");
    await expect(menu).toHaveCount(0);
    await button.click();
    await expect(menu).toBeVisible();
    await expect(backdrop).toBeVisible();
    await expect(menu.getByText("公告", { exact: true })).toBeVisible();
    // 游客抽屉无商城/账户入口(设计稿 LoginMenu 口径:登录态才出现)
    await expect(menu.getByText("积分商店", { exact: true })).toHaveCount(0);
    await expect(menu.getByText("我的账户", { exact: true })).toHaveCount(0);
    // #56:首页▾ 二级项默认折叠,点箭头展开后可见
    await expect(menu.getByRole("link", { name: "客户端下载", exact: true })).toHaveCount(0);
    await menu.getByTestId("mobile-submenu-toggle-首页").click();
    await expect(menu.getByRole("link", { name: "客户端下载", exact: true })).toBeVisible();
    // 遮罩点击关闭抽屉(侧边浮出不再推挤页面;点左侧纯遮罩区,避开右侧抽屉面板)
    await backdrop.click({ position: { x: 40, y: 200 } });
    await expect(menu).toHaveCount(0);
    await expect(backdrop).toHaveCount(0);
  });
});

test.describe("登录菜单(FR-201)", () => {
  test("积分商店▾/我的账户 仅登录态可见,商店子项购物车/结账", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await expect(nav.getByText("积分商店", { exact: true })).toBeVisible();
    await expect(nav.getByText("我的账户", { exact: true })).toBeVisible();
    // 登录态积分收敛到头像下拉(2026-11-05 页头 chip 下线)
    await expect(page.getByTestId("header-points")).toHaveCount(0);
    await page.getByTestId("user-menu-button").click();
    await expect(page.getByTestId("menu-points")).toContainText("积分");
    await page.keyboard.press("Escape");
    await nav.getByText("积分商店", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "购物车" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "结账" })).toBeVisible();
    // 我的账户▾ 直达用户中心各页
    await nav.getByText("我的账户", { exact: true }).hover();
    await expect(nav.getByRole("link", { name: "我的角色" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "账户设置" })).toBeVisible();
    // 登录后页头登录/注册入口退位
    await expect(page.getByRole("link", { name: "注 册" })).toHaveCount(0);
  });

  test("积分余额组件全端下线;登录态积分在头像下拉(FR-206,2026-11-05)", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(
      page.getByTestId("site-sidebar").getByTestId("sidebar-points-balance"),
    ).toHaveCount(0);
    await page.getByTestId("user-menu-button").click();
    const menuPoints = page.getByTestId("menu-points");
    await expect(menuPoints).toContainText("积分");
    await expect(menuPoints.locator("span").last()).toHaveText(/^\d+$/);
  });

  test("管理员头像下拉含「进入后台」快捷入口,普通用户无(#97)", async ({ page }) => {
    // 普通登录用户:菜单无后台入口
    await login(page);
    await page.goto("/");
    await page.getByTestId("user-menu-button").click();
    await expect(page.getByTestId("menu-admin-entry")).toHaveCount(0);

    // 管理员:头像下拉给出后台入口,点击直达后台
    await loginAdmin(page);
    await page.goto("/");
    await page.getByTestId("user-menu-button").click();
    const entry = page.getByTestId("menu-admin-entry");
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("href", "/admin");
    await entry.click();
    await expect(page).toHaveURL(/\/admin$/);
    // 后台外壳自带后台导航(前台页头不在 /admin 渲染)
    await expect(
      page.getByRole("navigation", { name: "后台导航" }).getByRole("link", { name: "仪表盘" }),
    ).toBeVisible();
  });

  test("侧栏 QQ 交流群卡:群号直达加群链接+复制指引(issue #95 恢复原站点行为)", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("site-sidebar").getByTestId("sidebar-qq-group");
    await expect(card).toBeVisible();
    // 群号为 5-12 位数字(具体值由后台配置,并行 spec 保存期间不锁定具体值)
    await expect(card.getByTestId("sidebar-qq-group-number")).toHaveText(/^\d{5,12}$/);
    // 二维码默认渲染(WP 原版页脚素材 public/qq-group-qr.png;不锁 src,防并行 spec 保存干扰)
    await expect(card.getByTestId("sidebar-qq-group-qr")).toBeVisible();
    // 加群链接默认配置:群号渲染为 qm.qq.com 超链接,点击直达加群页(不锁 key,防并行 spec 改写)
    await expect(card.getByTestId("sidebar-qq-group-join")).toHaveAttribute("href", /qm\.qq\.com/);
    await expect(card.getByTestId("sidebar-qq-group-hint")).toContainText("点击群号直接加群");
    // 复制按钮仍可用 → 剪贴板写入或环境拒绝,均离开默认文案(复制结果态)
    await card.getByTestId("sidebar-qq-group-copy").click();
    await expect(card.getByTestId("sidebar-qq-group-hint")).toContainText(/已复制群号|复制失败/);
  });
});
