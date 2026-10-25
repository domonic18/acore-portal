import { expect, test, type APIRequestContext } from "@playwright/test";
import { TOOL_PAGES } from "../../src/constants/tools";

/**
 * T024 US1 工具页六页 E2E(契约 tools-and-seo,SC-301):
 * 六页自身 200+iframe src 逐行契约+常驻外链按钮;主导航菜单逐项可达
 * (公告▾封号记录+数据库▾四项;在线查询不进导航);旧 page_id 六键 301
 * (globalSetup 播种,route 缓存进程内快照,陈旧则跳过提示重启)。
 * 外部服务(rank.lokta.cn/webdkp)可用性不在断言面。
 */

async function redirectTarget(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  const loc = res.headers().location;
  return { res, target: loc ? new URL(loc, "http://localhost").pathname : null };
}

test.describe("工具页六页(US1,SC-301)", () => {
  test("六页 200+iframe src+外链按钮与契约表逐行一致", async ({ page }) => {
    for (const tool of TOOL_PAGES) {
      const res = await page.goto(tool.path);
      expect(res?.status(), `${tool.path} 状态`).toBe(200);
      const frame = page.getByTestId("tools-iframe");
      await expect(frame).toHaveAttribute("src", tool.iframeSrc);
      await expect(frame).toHaveAttribute("title", tool.title);
      await expect(page.getByTestId("tools-open-external")).toHaveAttribute(
        "href",
        tool.iframeSrc,
      );
    }
  });

  test("在线查询页 200(不进导航,直达口径)", async ({ page }) => {
    const online = TOOL_PAGES.find((t) => t.path === "/online");
    expect(online).toBeDefined();
    const res = await page.goto("/online");
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("tools-iframe")).toHaveAttribute(
      "src",
      online!.iframeSrc,
    );
  });

  test("主导航菜单逐项可达:公告▾封号记录+数据库▾四项", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "主导航" });
    await nav.getByText("公告", { exact: true }).hover();
    await expect(
      nav.getByRole("link", { name: "封号记录" }),
    ).toHaveAttribute("href", "/banlist");

    await nav.getByText("数据库", { exact: true }).hover();
    for (const [label, href] of [
      ["英雄榜", "/hardcore"],
      ["在线玩家", "/online-players"],
      ["在线地图", "/playermap"],
      ["DKP查询", "/dkp"],
    ] as const) {
      await expect(
        nav.getByRole("link", { name: label }),
      ).toHaveAttribute("href", href);
    }
    // 在线查询不进导航
    await expect(nav.getByRole("link", { name: "在线查询" })).toHaveCount(0);

    // 点击一级入口落到工具页,iframe 出现
    await page.goto("/");
    await nav.getByText("数据库", { exact: true }).hover();
    await nav.getByRole("link", { name: "DKP查询" }).click();
    await expect(page).toHaveURL(/\/dkp$/);
    await expect(page.getByTestId("tools-iframe")).toBeVisible();
  });

  test("旧 page_id 六键 301 到六工具页(US1 T024)", async ({ request }) => {
    const probe = await redirectTarget(
      request,
      `/?page_id=${TOOL_PAGES[0]!.legacyPageId}`,
    );
    test.skip(probe.res.status() === 404, "dev server route 缓存早于播种加载,重启 dev server 后重跑");

    for (const tool of TOOL_PAGES) {
      const { res, target } = await redirectTarget(
        request,
        `/?page_id=${tool.legacyPageId}`,
      );
      expect(res.status(), `page_id:${tool.legacyPageId} 状态`).toBe(301);
      expect(target, `page_id:${tool.legacyPageId} 去向`).toBe(tool.path);
    }
  });
});
