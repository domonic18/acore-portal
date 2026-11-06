import { expect, test, type Page } from "@playwright/test";

/**
 * issue #94:静态页后台
 * ① /sitemap 编辑页展示系统生成的链接分组预览(与前台显示一致),正文标为可选导语;
 * ② 核心静态页(站内固定链接引用)别名锁定、列表页无删除入口。
 */
async function loginAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test("网站地图编辑页展示系统生成内容,核心页不可删/改别名", async ({ page }) => {
  await loginAdmin(page);

  await page.goto("/admin/pages");
  const row = page.getByRole("row").filter({ hasText: "/sitemap" });
  await expect(row.getByText("核心")).toBeVisible();
  await expect(row.getByRole("button", { name: "删除" })).toHaveCount(0);

  await row.getByRole("link", { name: "编辑" }).click();
  await expect(page).toHaveURL(/\/admin\/pages\/\d+$/);
  await expect(page.getByText("系统生成内容(前台实时显示)")).toBeVisible();
  await expect(page.getByTestId("sitemap-groups")).toBeVisible();
  await expect(page.getByTestId("sitemap-groups")).toContainText("主要栏目");
  await expect(page.getByLabel(/别名 slug/)).toBeDisabled();
});
