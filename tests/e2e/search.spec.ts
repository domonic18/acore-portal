import { expect, test } from "@playwright/test";

/**
 * /search 站内搜索 E2E(M8 W1 先行形态):
 * hero 引导态 / 关键词命中(mark 高亮 + 单一 bg-panel 列表)/ 空态 /
 * 页头搜索 ICON 入口可达(2026-11-18 搜索退出主导航) / 语义降级条(通道未配置恒显,W7 Agent 接管后仅故障时显示)。
 */
test.describe("站内搜索(M8)", () => {
  test("页头搜索 ICON 入口可达,hero 态展示分组范围", async ({ page }) => {
    await page.goto("/");
    // 2026-11-18 用户反馈:搜索退出主导航,入口收敛为页头右侧搜索 ICON(铃铛左侧)
    await page.getByTestId("header-search-link").click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { name: "站内搜索" })).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "搜索关键词" }),
    ).toBeVisible();
    for (const label of ["攻略文章", "使用说明", "商品", "论坛"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    // hero 态无降级条、无结果列表
    await expect(page.getByText("AI 语义检索尚未启用")).toHaveCount(0);
    await expect(page.locator("main ul").first()).toBeVisible(); // 分组 chips
  });

  test("关键词命中:meta 行 + mark 高亮 + bg-panel 列表 + 降级条", async ({
    page,
  }) => {
    await page.goto("/search?q=欢迎");
    await expect(
      page.getByText(/条与「欢迎」相关的结果/),
    ).toBeVisible();
    await expect(page.getByText("AI 语义检索尚未启用")).toBeVisible();
    const list = page.locator("main ul >> nth=0");
    await expect(list).toHaveClass(/bg-panel/);
    const firstRow = list.locator("li").first();
    await expect(firstRow.locator("mark").first()).toHaveText(/欢迎/);
    await expect(
      firstRow.getByRole("link").first(),
    ).toHaveAttribute("href", /\/post\//);
    // 命中片段带 path 行(groupLabel + url)
    await expect(firstRow.getByText("/post/", { exact: false })).toBeVisible();
  });

  test("hero 态输入提交跳转结果态", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("searchbox", { name: "搜索关键词" }).fill("矿石");
    await page.getByRole("button", { name: "搜索" }).click();
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole("heading", { name: "站内搜索" })).toBeVisible();
  });

  test("无命中显示空态与建议", async ({ page }) => {
    await page.goto("/search?q=zzzqqq绝对不存在");
    await expect(
      page.getByText(/未找到与「zzzqqq绝对不存在」相关的内容/),
    ).toBeVisible();
    await expect(page.getByText("换个说法,或拆成更短的关键词")).toBeVisible();
    // 降级条在结果态(含空结果)恒显:语义通道未配置即如实告知
    await expect(page.getByText("AI 语义检索尚未启用")).toBeVisible();
  });
});
