import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 二期商城增强后台 E2E:
 * ① 限购字段表单保存→回显(API PATCH 透传 max_per_user);
 * ② 商品列表批量选择→批量下架生效(工具栏+行状态);
 * ③ 服务类商品复制生成草稿副本;物品类复制按钮禁用;
 * ④ 快速编辑:行内改价+精选保存落库,促销价校验红字,服务类库存禁用。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const STARTED_AT = new Date();
const SLUG_PREFIX = `e2eprod-${RUN}-`;
const CATEGORY_SLUG = `e2eprod-cat-${RUN}`;

let categoryId = 0n;
let limitId = 0n;
let batchId = 0n;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

async function createProduct(input: {
  sku: string;
  slug: string;
  name: string;
  type: "game_item" | "service";
  gameItemId?: number;
}): Promise<bigint> {
  const created = await prisma.product.create({
    data: {
      sku: input.sku,
      slug: input.slug,
      name: input.name,
      description: "E2E 商品增强",
      type: input.type,
      status: "published",
      listed: true,
      price: 100,
      gameItemId: input.gameItemId ?? null,
      categoryId,
    },
    select: { id: true },
  });
  return created.id;
}

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });

  categoryId = (
    await prisma.productCategory.create({
      data: { name: `E2E 商品增强 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;

  // 物品类商品的 SKU 必须是 itemsend_{真实存在的物品ID}(编辑页保存会做交叉校验),
  // 取 19500+ 测试区间(见 scripts/dev/initdb/init-game-schemas.sql)
  limitId = await createProduct({
    sku: "itemsend_19500",
    slug: `${SLUG_PREFIX}limit`,
    name: `E2E 限购商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19500,
  });
  batchId = await createProduct({
    sku: "itemsend_19501",
    slug: `${SLUG_PREFIX}batch`,
    name: `E2E 批量商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19501,
  });
  await createProduct({
    sku: `e2e-svc-${RUN}`,
    slug: `${SLUG_PREFIX}svc`,
    name: `E2E 服务商品 ${RUN}`,
    type: "service",
  });
  await createProduct({
    sku: "itemsend_19502",
    slug: `${SLUG_PREFIX}item`,
    name: `E2E 物品商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19502,
  });
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  const admin = await prisma.user.findUnique({
    where: { username: "m1admin" },
    select: { id: true },
  });
  if (admin) {
    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: admin.id,
        action: { in: ["product_batch_updated", "product_duplicated"] },
        createdAt: { gte: STARTED_AT },
      },
    });
  }
  await prisma.$disconnect();
});

test.describe("商品增强后台(限购/批量/复制)", () => {
  test("限购字段保存后回显", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${limitId}`);
    const input = page.getByLabel(/每人限购/);
    await input.fill("2");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);

    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: limitId },
      select: { maxPerUser: true },
    });
    expect(saved.maxPerUser).toBe(2);

    await page.goto(`/admin/products/${limitId}`);
    await expect(page.getByLabel(/每人限购/)).toHaveValue("2");
  });

  test("列表勾选批量下架:行状态变为草稿", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=1");
    await page.getByLabel(`选择商品 ${batchId}`).check();
    await expect(page.getByTestId("product-batch-toolbar")).toContainText("已选 1 件");
    await page.getByRole("button", { name: "批量下架" }).click();
    await expect(page.getByTestId("product-batch-toolbar")).toContainText("已处理 1 件");

    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: batchId },
      select: { status: true },
    });
    expect(saved.status).toBe("draft");
    await expect(
      page.getByRole("row", { name: new RegExp(`E2E 批量商品 ${RUN}`) }),
    ).toContainText("草稿");
  });

  test("服务类复制生成草稿副本;物品类复制按钮禁用", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=1");

    const svcRow = page.getByRole("row", { name: new RegExp(`E2E 服务商品 ${RUN}`) });
    await svcRow.getByRole("button", { name: "复制" }).click();
    await expect(
      page.getByRole("row", { name: /E2E 服务商品.*副本/ }),
    ).toBeVisible();

    const copies = await prisma.product.count({
      where: { slug: { startsWith: `${SLUG_PREFIX}svc-copy` } },
    });
    expect(copies).toBe(1);
    const copy = await prisma.product.findFirstOrThrow({
      where: { slug: { startsWith: `${SLUG_PREFIX}svc-copy` } },
      select: { status: true, sku: true },
    });
    expect(copy.status).toBe("draft");
    expect(copy.sku).toBe(`e2e-svc-${RUN}-copy`);

    const itemRow = page.getByRole("row", { name: new RegExp(`E2E 物品商品 ${RUN}`) });
    await expect(itemRow.getByRole("button", { name: "复制" })).toBeDisabled();
    expect(await prisma.product.count({ where: { slug: { startsWith: `${SLUG_PREFIX}item-copy` } } })).toBe(0);
  });

  test("快速编辑:行内改价+首页精选保存落库(issue 2026-11-03)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=1");
    const row = page.getByRole("row", { name: new RegExp(`E2E 物品商品 ${RUN}`) });
    await row.getByRole("button", { name: "快速编辑" }).click();

    const form = page.getByTestId("product-quick-edit-form");
    const priceInput = form.getByLabel("原价(积分)");
    await priceInput.fill("128");
    await form.getByLabel("首页精选").click();
    await form.getByRole("button", { name: "保存" }).click();
    await expect(page.getByTestId("product-quick-edit-form")).toHaveCount(0);

    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: (await prisma.product.findFirstOrThrow({
        where: { slug: `${SLUG_PREFIX}item` },
        select: { id: true },
      })).id },
      select: { price: true, featured: true },
    });
    expect(saved.price).toBe(128);
    expect(saved.featured).toBe(true);

    // 行内促销价校验:促销价 ≥ 原价红字,不提交
    await row.getByRole("button", { name: "快速编辑" }).click();
    const form2 = page.getByTestId("product-quick-edit-form");
    await form2.getByLabel("促销价(留空=无促销)").fill("128");
    await form2.getByRole("button", { name: "保存" }).click();
    await expect(form2.getByRole("alert")).toContainText("促销价必须低于原价");
    await form2.getByRole("button", { name: "取消" }).click();
    await expect(page.getByTestId("product-quick-edit-form")).toHaveCount(0);
    const untouched = await prisma.product.findUniqueOrThrow({
      where: { slug: `${SLUG_PREFIX}item` },
      select: { salePrice: true },
    });
    expect(untouched.salePrice).toBeNull();
  });

  test("快速编辑:服务类库存禁用并提示(issue 2026-11-03)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products?page=1");
    // 前序用例已生成「副本」行,按 SKU 精确匹配原行避免 strict 冲突
    const svcRow = page
      .getByRole("row")
      .filter({ has: page.getByText(`e2e-svc-${RUN}`, { exact: true }) });
    await svcRow.getByRole("button", { name: "快速编辑" }).click();
    const form = page.getByTestId("product-quick-edit-form");
    await expect(form.getByLabel("启用库存")).toBeDisabled();
    await expect(form.getByText("服务类商品不使用库存")).toBeVisible();
    await form.getByRole("button", { name: "取消" }).click();
  });
});
