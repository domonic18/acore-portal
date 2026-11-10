import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * M4 侧栏快捷入口后台 E2E:
 * ① 权限口径:游客/user 访问 /admin/sidebar → 登录页;
 * ② admin 进入编辑器,改「补丁下载」卡链接/备注 + 新增一张卡 → 保存;
 * ③ /about 侧栏即时渲染改后的卡与新增卡(通用化落库链路)。
 * sidebar_card/sidebar_link 为全局数据:用前快照、用后还原。
 */
const prisma = new PrismaClient();

type CardSnapshot = {
  key: string;
  title: string;
  pages: string[];
  body: string | null;
  sort: number;
  links: { label: string; href: string; note: string | null; sort: number }[];
};

let backup: CardSnapshot[] = [];
let componentBackup: { key: string; pages: string[] }[] = [];

async function snapshot(): Promise<CardSnapshot[]> {
  const rows = await prisma.sidebarCard.findMany({
    include: { links: { orderBy: { sort: "asc" } } },
    orderBy: { sort: "asc" },
  });
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    pages: row.pages as string[],
    body: row.body,
    sort: row.sort,
    links: row.links.map((link) => ({
      label: link.label,
      href: link.href,
      note: link.note,
      sort: link.sort,
    })),
  }));
}

async function restore(cards: CardSnapshot[]) {
  await prisma.sidebarLink.deleteMany();
  await prisma.sidebarCard.deleteMany();
  for (const card of cards) {
    await prisma.sidebarCard.create({
      data: {
        key: card.key,
        title: card.title,
        pages: card.pages,
        body: card.body,
        sort: card.sort,
        links: { create: card.links },
      },
    });
  }
}

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  backup = await snapshot();
  componentBackup = (await prisma.sidebarComponent.findMany()).map((row) => ({
    key: row.key,
    pages: row.pages as string[],
  }));
});

test.afterAll(async () => {
  await restore(backup);
  await prisma.sidebarComponent.deleteMany();
  if (componentBackup.length > 0) {
    await prisma.sidebarComponent.createMany({ data: componentBackup });
  }
  await prisma.$disconnect();
});

test("游客访问 /admin/sidebar → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/sidebar");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsidebar/);
});

test("user 角色 → 同样拦截(非 admin)", async ({ page }) => {
  await login(page, "legacyuser", "oldpass123");
  await page.goto("/admin/sidebar");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsidebar/);
});

test("admin 编辑卡片+新增卡片 → 前台侧栏即时生效", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");

  await page.goto("/admin");
  await expect(
    page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "侧栏入口" }),
  ).toHaveAttribute("href", "/admin/sidebar");

  await page.goto("/admin/sidebar");
  await expect(page.getByTestId("admin-sidebar-manager")).toBeVisible();

  // 折叠行列表:改「补丁下载」卡需先展开编辑器(2026-11-10 UX 重构)
  await page.getByTestId("sidebar-card-patch-toggle").click();
  await expect(page.getByTestId("sidebar-card-patch-link-0-href")).toBeVisible();
  // 展开态右侧有前台效果预览(标题跟随卡片标题)
  await expect(page.getByTestId("sidebar-card-patch-preview")).toContainText("补丁下载");
  await page.getByTestId("sidebar-card-patch-link-0-href").fill("/tutorial#e2e-patch");
  await page.getByTestId("sidebar-card-patch-link-0-note").fill("E2E 补丁文案");
  // 收起后编辑器隐藏(折叠交互)
  await page.getByTestId("sidebar-card-patch-toggle").click();
  await expect(page.getByTestId("sidebar-card-patch-link-0-href")).toHaveCount(0);

  // 新增一张卡(默认页面范围=静态页,新卡自动展开直接可填)
  await page.getByTestId("sidebar-add-card").click();
  // 卡容器与内部输入同前缀(data-testid=sidebar-card-<key>[-字段]),限定 div 取容器
  const newCard = page.locator('div[data-testid^="sidebar-card-custom-"]').last();
  await expect(newCard).toBeVisible();
  await newCard.locator('[data-testid$="-title"]').fill("E2E 新卡");
  await newCard.locator('[data-testid$="-link-0-label"]').fill("新入口");
  await newCard.locator('[data-testid$="-link-0-href"]').fill("/tutorial#e2e-new");
  await newCard.locator('[data-testid$="-link-0-note"]').fill("E2E 备注");

  await page.getByTestId("sidebar-save").click();
  await expect(page.getByTestId("sidebar-save-result")).toContainText("已保存");

  // 前台静态页(/about)侧栏按页渲染:改后的卡片 + 新增卡
  await page.goto("/about");
  const patchCard = page.getByTestId("sidebar-card-patch");
  await expect(
    patchCard.getByRole("link", { name: "补丁下载 · E2E 补丁文案" }),
  ).toHaveAttribute("href", "/tutorial#e2e-patch");
  const newFrontCard = page.getByTestId("site-sidebar").getByText("E2E 新卡", { exact: true });
  await expect(newFrontCard).toBeVisible();
  await expect(
    page.getByRole("link", { name: "新入口 · E2E 备注" }),
  ).toHaveAttribute("href", "/tutorial#e2e-new");
});

test("内置组件页面范围可配:QQ 群卡关首页 → 首页消失,恢复后回归(2026-11-05)", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/sidebar");

  // 内置组件区:注册表 3 组件渲染(积分余额卡 2026-11-05 下线),QQ 群默认含首页
  const section = page.getByTestId("sidebar-components-section");
  await expect(section).toBeVisible();
  for (const key of ["server-status", "latest-news", "qq-group"]) {
    await expect(page.getByTestId(`sidebar-comp-${key}`)).toBeVisible();
  }
  await expect(page.getByTestId("sidebar-comp-qq-group-page-home")).toBeChecked();

  // 取消 QQ 群的首页范围 → 保存(checkbox 为 sr-only,点外层 chip 标签触发)
  await page.getByTestId("sidebar-comp-qq-group").getByText("首页", { exact: true }).click();
  await page.getByTestId("sidebar-save").click();
  await expect(page.getByTestId("sidebar-save-result")).toContainText("已保存");

  // 首页侧栏 QQ 卡消失
  await page.goto("/");
  await expect(page.getByTestId("sidebar-qq-group")).toHaveCount(0);

  // 恢复首页范围 → QQ 卡回归
  await page.goto("/admin/sidebar");
  await page.getByTestId("sidebar-comp-qq-group").getByText("首页", { exact: true }).click();
  await page.getByTestId("sidebar-save").click();
  await expect(page.getByTestId("sidebar-save-result")).toContainText("已保存");
  await page.goto("/");
  await expect(page.getByTestId("sidebar-qq-group")).toBeVisible();
});
