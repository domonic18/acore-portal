import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T036 US3 结账 E2E(quickstart S3/SC-101/SC-104):
 * 登录→选角色→加购→结算页复核→支付→订单详情 completed(异步发货轮询到位);
 * 余额不足:结算页拦截+按钮禁付+API 402,无订单产生。
 * fixture:业务库直写商品(.Run 隔离)+ legacyuser 临时积分账户(用后还原);
 * 发货走 soap-mock(localhost:7878,.send items 正常态)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const CATEGORY_SLUG = `e2eckout-${RUN}`;
const PAY_SLUG = `e2eckout-pay-${RUN}`;
const BROKE_SLUG = `e2eckout-broke-${RUN}`;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function addAndOpenCheckout(page: Page, slug: string) {
  await page.goto(`/shop/${slug}`);
  await page.getByLabel("选择角色").selectOption("10");
  await page.getByRole("button", { name: "加入购物车" }).click();
  await expect(page.getByRole("status")).toContainText("已加入购物车");
  await page.getByRole("link", { name: "去结算" }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await page.getByRole("link", { name: "去结算" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
}

test.beforeAll(async () => {
  // soap-mock 归位正常态(前序测试可能残留 timeout/failure)
  const soapUrl = (
    await prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM system_config WHERE \`key\` = 'soap.url' LIMIT 1`
  )[0]?.value;
  if (soapUrl) {
    await fetch(`${soapUrl.replace(/\/?$/, "")}/__mode?mode=normal`).catch(() => {});
  }
  // 清历史崩溃残留
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "e2eckout-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2eckout-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });

  const legacy = await prisma.user.findUniqueOrThrow({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  // 结账需积分账户;测试后还原(见 afterAll)
  await prisma.pointAccount.upsert({
    where: { userId: legacy.id },
    update: { balance: 1_000_000 },
    create: { userId: legacy.id, balance: 1_000_000 },
  });

  const category = await prisma.productCategory.create({
    data: { name: `E2E 结账分类 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
    select: { id: true },
  });
  await prisma.product.createMany({
    data: [
      {
        sku: `itemsend_19061`,
        slug: PAY_SLUG,
        name: `E2E 结账坐骑 ${RUN}`,
        description: "E2E 结账全流程",
        type: "game_item",
        status: "published",
        price: 100,
        stockEnabled: true,
        stock: 3,
        gameItemId: 19061,
        categoryId: category.id,
      },
      {
        sku: `itemsend_19062`,
        slug: BROKE_SLUG,
        name: `E2E 余额不足商品 ${RUN}`,
        description: "余额不足拦截",
        type: "game_item",
        status: "published",
        price: 100,
        gameItemId: 19062,
        categoryId: category.id,
      },
    ],
  });
});

test.afterAll(async () => {
  // 先删订单(级联行),再按行清发货审计,最后商品/分类/余额还原
  const legacy = await prisma.user.findUniqueOrThrow({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  const orders = await prisma.order.findMany({
    where: { userId: legacy.id, items: { some: { product: { slug: { startsWith: "e2eckout-" } } } } },
    select: { id: true, items: { select: { id: true } } },
  });
  for (const order of orders) {
    for (const item of order.items) {
      const prefix = `orderitem:${item.id}:`;
      await prisma.soapCall.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
      await prisma.$executeRaw`
        DELETE FROM audit_log
        WHERE category = 'soap'
          AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.key')) LIKE ${`${prefix}%`}
      `;
    }
  }
  await prisma.order.deleteMany({
    where: { id: { in: orders.map((o) => o.id) } },
  });
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "e2eckout-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "e2eckout-" } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  // 余额还原:结账 -100 与不足测试的临时 10/1000000,统一重置为标准种子值
  await prisma.pointAccount.updateMany({
    where: { userId: legacy.id },
    data: { balance: 1_000_000 },
  });
  await prisma.$disconnect();
});

test.describe("US3 结账支付(T036)", () => {
  test("全链路:加购→结算复核→支付→订单详情自动 completed(SC-101)", async ({ page }) => {
    await login(page);
    await addAndOpenCheckout(page, PAY_SLUG);

    // 结算页复核:行参数+应付+余额
    await expect(page.getByText("角色:Oldwarrior")).toBeVisible();
    await expect(page.getByText("应付:100 积分")).toBeVisible();
    await page.getByRole("button", { name: /确认支付 100 积分/ }).click();

    await expect(page).toHaveURL(/\/account\/orders\/\d+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "订单详情" })).toBeVisible();

    // 发货异步驱动:轮询 reload 直至 completed(发货成功全程无人工,SC-102)
    await expect(
      async () => {
        await page.reload();
        await expect(page.getByText("已完成", { exact: true })).toBeVisible();
      },
    ).toPass({ timeout: 30_000 });
    await expect(page.getByText("已发货", { exact: true })).toBeVisible();
    await expect(page.getByText(/M2\d{10}/)).toBeVisible(); // orderNo
    // 库存已扣(3→2)
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: PAY_SLUG },
      select: { stock: true },
    });
    expect(product.stock).toBe(2);
  });

  test("余额不足:结算页拦截+按钮禁付+API 402 无订单", async ({ page }) => {
    await login(page);
    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const ordersBefore = await prisma.order.count({ where: { userId: legacy.id } });
    await prisma.pointAccount.update({
      where: { userId: legacy.id },
      data: { balance: 10 },
    });

    await addAndOpenCheckout(page, BROKE_SLUG);
    await expect(page.getByText("余额不足,请先充值或调整购物车。")).toBeVisible();
    await expect(page.getByRole("button", { name: /确认支付/ })).toBeDisabled();

    const res = await page.request.post("/api/checkout");
    expect(res.status()).toBe(402);
    expect((await res.json()).error.code).toBe("INSUFFICIENT_BALANCE");
    expect(await prisma.order.count({ where: { userId: legacy.id } })).toBe(ordersBefore);
  });
});
