import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 商城左栏分面 E2E(FR-109 重构后):
 * 分类分面树(父可展开、子带计数、零计数不出现)、关键词搜索、价格分面、排序下拉、
 * URL 可分享、三态空态、窄屏折叠。
 *
 * fixture 直写业务库(自建父子分类 + 商品),不依赖存量迁移数据 ⇒ 任何 schema 都能跑。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);

const PARENT = { name: `E2E 分面父 ${RUN}`, slug: `e2efacet-parent-${RUN}` };
const CHILD_A = { name: `E2E 分面子甲 ${RUN}`, slug: `e2efacet-a-${RUN}` };
const CHILD_B = { name: `E2E 分面子乙 ${RUN}`, slug: `e2efacet-b-${RUN}` };
const EMPTY = { name: `E2E 分面空 ${RUN}`, slug: `e2efacet-empty-${RUN}` };

const P1 = { name: `E2E 分面商品甲一 ${RUN}`, slug: `e2efacet-p1-${RUN}`, price: 100 };
const P2 = { name: `E2E 分面商品甲二 ${RUN}`, slug: `e2efacet-p2-${RUN}`, price: 500 };
const P3 = { name: `E2E 分面商品乙一 ${RUN}`, slug: `e2efacet-p3-${RUN}`, price: 2000 };
const P4 = { name: `E2E 独特词商品 ${RUN}`, slug: `e2efacet-p4-${RUN}`, price: 100 };

/** 分类行上的计数(计数在链接外,链接可访问名=分类名) */
function countOf(page: Page, name: string) {
  return page.getByRole("link", { name, exact: true }).locator("xpath=following-sibling::span[1]");
}

/** 结果区商品卡数量 */
function cards(page: Page) {
  return page.locator("main ul li a[href^='/shop/']");
}

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2efacet-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: "e2efacet-" } } });

  const parent = await prisma.productCategory.create({
    data: { name: PARENT.name, slug: PARENT.slug, sort: 900 },
    select: { id: true },
  });
  const childA = await prisma.productCategory.create({
    data: { name: CHILD_A.name, slug: CHILD_A.slug, parentId: parent.id, sort: 901 },
    select: { id: true },
  });
  const childB = await prisma.productCategory.create({
    data: { name: CHILD_B.name, slug: CHILD_B.slug, parentId: parent.id, sort: 902 },
    select: { id: true },
  });
  await prisma.productCategory.create({
    data: { name: EMPTY.name, slug: EMPTY.slug, sort: 903 },
  });

  await prisma.product.createMany({
    data: [
      { sku: `itemsend_19019`, slug: P1.slug, name: P1.name, description: "分面父品", type: "game_item", status: "published", price: P1.price, gameItemId: 19019, categoryId: childA.id },
      { sku: `itemsend_19021`, slug: P2.slug, name: P2.name, description: "分面父品", type: "game_item", status: "published", price: P2.price, gameItemId: 19021, categoryId: childA.id },
      { sku: `itemsend_19023`, slug: P3.slug, name: P3.name, description: "分面父品", type: "game_item", status: "published", price: P3.price, gameItemId: 19023, categoryId: childB.id },
      { sku: `itemsend_19025`, slug: P4.slug, name: P4.name, description: "分面父品", type: "game_item", status: "published", price: P4.price, gameItemId: 19025, categoryId: childA.id },
    ],
  });
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2efacet-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: "e2efacet-" } } });
  await prisma.$disconnect();
});

test.describe("商城分面筛选", () => {
  test("E1 父分类可展开、子分类带计数、点子分类返回对应商品", async ({ page }) => {
    await page.goto("/shop");
    const parentLink = page.getByRole("link", { name: PARENT.name, exact: true });
    await expect(parentLink).toBeVisible();
    // 父分类计数=子树合计(3 + 1)
    await expect(countOf(page, PARENT.name)).toHaveText("4");

    // 子分类默认收起,展开后各带自身计数
    await expect(page.getByRole("link", { name: CHILD_A.name, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `展开「${PARENT.name}」` }).click();
    await expect(page.getByRole("link", { name: CHILD_A.name, exact: true })).toBeVisible();
    await expect(countOf(page, CHILD_A.name)).toHaveText("3");
    await expect(countOf(page, CHILD_B.name)).toHaveText("1");

    // 点子分类 ⇒ 只出该子分类商品,URL 带分类参数
    await page.getByRole("link", { name: CHILD_A.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]category=${CHILD_A.slug}`));
    await expect(page.getByText(P1.name)).toBeVisible();
    await expect(page.getByText(P3.name)).toHaveCount(0);
    await expect(page.getByTestId("shop-result-count")).toHaveText("共 3 件商品");
  });

  test("E2 零计数分类不出现在分面栏(点了也是空)", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("link", { name: EMPTY.name, exact: true })).toHaveCount(0);
  });

  test("E3 搜索框输入关键词过滤、结果计数正确", async ({ page }) => {
    await page.goto("/shop");
    await page.getByRole("searchbox", { name: "搜索商品" }).fill("独特词");
    await page.getByRole("searchbox", { name: "搜索商品" }).press("Enter");
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(page.getByText(P4.name)).toBeVisible();
    await expect(page.getByText(P1.name)).toHaveCount(0);
    await expect(page.getByTestId("shop-result-count")).toHaveText("共 1 件商品");
  });

  test("E4 价格区间过滤 + 预设档", async ({ page }) => {
    await page.goto(`/shop?category=${PARENT.slug}`);
    // 预设档:0 – 100 ⇒ 命中两件 100 积分商品
    await page.getByRole("link", { name: "0 – 100", exact: true }).click();
    await expect(page).toHaveURL(/[?&]min=0/);
    await expect(page).toHaveURL(/[?&]max=100/);
    await expect(page.getByText(P1.name)).toBeVisible();
    await expect(page.getByText(P4.name)).toBeVisible();
    await expect(page.getByText(P2.name)).toHaveCount(0);
    await expect(page.getByText(P3.name)).toHaveCount(0);
    await expect(page.getByTestId("shop-result-count")).toHaveText("共 2 件商品");
  });

  test("E5 排序下拉切换 + URL 参数正确", async ({ page }) => {
    await page.goto(`/shop?category=${PARENT.slug}`);
    const select = page.getByRole("combobox", { name: "排序方式" });
    await expect(select).toBeEnabled();
    await select.selectOption("price_asc");
    await expect(page).toHaveURL(/[?&]sort=price_asc/);
    const order = await cards(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? ""),
    );
    // 价升序:500 的 P2 必须排在 2000 的 P3 之前
    expect(order.indexOf(`/shop/${P2.slug}`)).toBeLessThan(order.indexOf(`/shop/${P3.slug}`));

    // 降序相反
    await select.selectOption("price_desc");
    await expect(page).toHaveURL(/[?&]sort=price_desc/);
    const desc = await cards(page).evaluateAll((els) =>
      els.map((e) => e.getAttribute("href") ?? ""),
    );
    expect(desc.indexOf(`/shop/${P3.slug}`)).toBeLessThan(desc.indexOf(`/shop/${P2.slug}`));
  });

  test("E6 筛选后 URL 可分享(重进 URL 结果一致)", async ({ page }) => {
    const url = `/shop?category=${CHILD_A.slug}&min=0&max=500&sort=price_asc`;
    await page.goto(url);
    await expect(page.getByTestId("shop-result-count")).toHaveText("共 3 件商品");
    await page.reload();
    await expect(page.getByTestId("shop-result-count")).toHaveText("共 3 件商品");
    await expect(
      page.getByRole("link", { name: `清除筛选 分类:${CHILD_A.name}` }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "清除筛选 价格:0 – 500" })).toBeVisible();
  });

  test("E7 空态:筛选无结果 / 分类下无上架商品分别命中", async ({ page }) => {
    // 筛选无结果
    await page.goto("/shop?q=不存在的关键词xyz");
    await expect(page.getByText("没有匹配的商品")).toBeVisible();
    // 分类下无上架商品(直接进 URL;该分类在分面栏里不出现)
    await page.goto(`/shop?category=${EMPTY.slug}`);
    await expect(page.getByText(`「${EMPTY.name}」暂无上架商品`)).toBeVisible();
  });

  test("E8 窄屏:筛选收敛为可展开的抽屉", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shop");
    const toggle = page.getByRole("button", { name: /筛选/ });
    await expect(toggle).toBeVisible();
    const panels = page.locator("#shop-facet-panels");
    await expect(panels).toBeHidden();
    await toggle.click();
    await expect(panels).toBeVisible();
    await expect(page.getByRole("link", { name: PARENT.name, exact: true })).toBeVisible();
  });
});
