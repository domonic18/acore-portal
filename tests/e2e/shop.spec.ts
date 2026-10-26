import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T026 US2 商城 E2E(quickstart S2 → FR-108~112/120):
 * 列表筛选→详情→选角色→加购→复核→移除全流程;游客加购引导登录;
 * 越权直发他人 guid → 403 CHARACTER_NOT_OWNED+审计;售罄可见禁购。
 * fixture:业务库直写商品(.Run 隔离),游戏端复用 initdb 种子
 * (LEGACYUSER=account 1,guid 10 Oldwarrior/11 Oldmage/12 Oldpriest;TAMPER 20)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const CATEGORY_SLUG = `e2eshop-${RUN}`;
const ITEM_SLUG = `e2eshop-item-${RUN}`;
const SOLDOUT_SLUG = `e2eshop-soldout-${RUN}`;
const TAMPER_GUID = 20;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health)
    VALUES (${TAMPER_GUID}, 2, 'Notmine', 1, 4, 0, 10, 0, 0, 0, 100)
    ON DUPLICATE KEY UPDATE account = 2
  `;
  // 清理历史崩溃运行遗留
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "e2eshop-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2eshop-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });

  const category = await prisma.productCategory.create({
    data: { name: `E2E 商城分类 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
    select: { id: true },
  });
  await prisma.product.createMany({
    data: [
      {
        sku: `itemsend_19019`,
        slug: ITEM_SLUG,
        name: `E2E 测试坐骑 ${RUN}`,
        description: "E2E 全流程商品",
        type: "game_item",
        status: "published",
        price: 500,
        stockEnabled: true,
        stock: 5,
        lowStockThreshold: 1,
        gameItemId: 19019,
        categoryId: category.id,
      },
      {
        sku: `itemsend_19021`,
        slug: SOLDOUT_SLUG,
        name: `E2E 售罄商品 ${RUN}`,
        description: "售罄拦截",
        type: "game_item",
        status: "published",
        price: 100,
        stockEnabled: true,
        stock: 0,
        gameItemId: 19021,
        categoryId: category.id,
      },
    ],
  });
});

test.afterAll(async () => {
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "e2eshop-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2eshop-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  await prisma.$disconnect();
});

test.describe("US2 商城与购物车(T026)", () => {
  test("游客访问详情 → 加购区呈现登录引导并跳转 /login", async ({ page }) => {
    await page.goto(`/shop/${ITEM_SLUG}`);
    await expect(page.getByRole("heading", { name: `E2E 测试坐骑 ${RUN}` })).toBeVisible();
    await expect(page.getByText("登录后选择角色购买。")).toBeVisible();
    await page.getByRole("link", { name: "去登录" }).click();
    // loginHref 对 next 值做 encodeURIComponent(79f5f90),query 值为规范百分号编码形态
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=%2Fshop%2F${ITEM_SLUG}$`),
    );
  });

  test("登录态全流程:列表筛选→详情→选角色→加购→复核→改数→移除", async ({ page }) => {
    await login(page);

    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "商城", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: `E2E 商城分类 ${RUN}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]category=${CATEGORY_SLUG}`));
    await expect(page.getByText(`E2E 测试坐骑 ${RUN}`)).toBeVisible();

    await page.getByRole("link", { name: `E2E 测试坐骑 ${RUN}` }).click();
    await expect(page).toHaveURL(new RegExp(`/shop/${ITEM_SLUG}$`));
    await page.getByLabel("选择角色").selectOption("10");
    await page.getByRole("button", { name: "加入购物车" }).click();
    await expect(page.getByRole("status")).toContainText("已加入购物车");

    await page.getByRole("link", { name: "去结算" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: "购物车" })).toBeVisible();
    await expect(page.getByText("角色:Oldwarrior")).toBeVisible();

    await page.getByRole("button", { name: "增加数量" }).click();
    await expect(page.getByLabel("数量", { exact: true })).toHaveText("2");
    await expect(page.getByText("小计 1000")).toBeVisible();

    await page.getByRole("button", { name: "移除" }).click();
    await expect(page.getByText("购物车还是空的")).toBeVisible();
  });

  test("售罄商品:详情可见但按钮禁购", async ({ page }) => {
    await login(page);
    await page.goto(`/shop/${SOLDOUT_SLUG}`);
    await expect(page.getByText("已售罄", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "已售罄" })).toBeDisabled();
  });

  test("越权直发他人 characterGuid → 403 + ownership_violation 审计", async ({ page }) => {
    await login(page);
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: ITEM_SLUG },
      select: { id: true },
    });
    const res = await page.request.post("/api/cart", {
      data: { productId: product.id.toString(), params: { characterGuid: TAMPER_GUID } },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error.code).toBe("CHARACTER_NOT_OWNED");

    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: legacy.id, action: "ownership_violation" },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.payloadJson as { scope?: string }).scope).toBe("cart_add");
  });
});
