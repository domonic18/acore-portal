import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 二期商城增强后台 E2E:
 * ① 限购字段表单保存→回显(API PATCH 透传 max_per_user);
 * ② 商品列表批量选择→批量下架生效(工具栏+行状态);
 * ③ 服务类商品复制生成草稿副本;物品类复制按钮禁用。
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

  limitId = await createProduct({
    sku: `e2e-limit-${RUN}`,
    slug: `${SLUG_PREFIX}limit`,
    name: `E2E 限购商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19019,
  });
  batchId = await createProduct({
    sku: `e2e-batch-${RUN}`,
    slug: `${SLUG_PREFIX}batch`,
    name: `E2E 批量商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19020,
  });
  await createProduct({
    sku: `e2e-svc-${RUN}`,
    slug: `${SLUG_PREFIX}svc`,
    name: `E2E 服务商品 ${RUN}`,
    type: "service",
  });
  await createProduct({
    sku: `e2e-item-${RUN}`,
    slug: `${SLUG_PREFIX}item`,
    name: `E2E 物品商品 ${RUN}`,
    type: "game_item",
    gameItemId: 19021,
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
});
