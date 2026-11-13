import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 商品 FAQ(#159)E2E:后台按商品增删改排 + 商城详情页展示。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `e2efaq-${RUN}-`;
const CATEGORY_SLUG = `e2efaq-cat-${RUN}`;
const SKU = `itemsend_${Date.now()}`;

let categoryId = 0n;
let productId = 0n;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

/** 按问题文案定位一条 FAQ 的行容器 */
async function faqRow(page: Page, question: string) {
  const id = await prisma.productFaq.findFirstOrThrow({
    where: { productId, question },
    select: { id: true },
  });
  return page.getByTestId(`product-faq-row-${id.id.toString()}`);
}

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });

  categoryId = (
    await prisma.productCategory.create({
      data: { name: `E2E FAQ 分类 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;

  productId = (
    await prisma.product.create({
      data: {
        sku: SKU,
        slug: `${SLUG_PREFIX}main`,
        name: `E2E FAQ 商品 ${RUN}`,
        description: "FAQ E2E",
        type: "game_item",
        status: "published",
        listed: true,
        price: 100,
        categoryId,
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.productFaq.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  await prisma.$disconnect();
});

test.describe("商品常见问题(#159)", () => {
  test("后台新增问答并落库", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${productId}/faq`);

    await page.getByLabel("新增问题").fill("发货后多久到账?");
    await page.getByLabel("新增答案").fill("支付成功后 5 分钟内发货。");
    await page.getByRole("button", { name: "新增" }).click();

    await expect(page.getByLabel("问题(第 1 条)")).toHaveValue("发货后多久到账?");
    await expect(page.getByLabel("答案(第 1 条)")).toHaveValue("支付成功后 5 分钟内发货。");

    const rows = await prisma.productFaq.findMany({
      where: { productId },
      orderBy: { id: "asc" },
      select: { question: true, answer: true, sort: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.question).toBe("发货后多久到账?");
    expect(rows[0]?.answer).toBe("支付成功后 5 分钟内发货。");
    expect(rows[0]?.sort).toBe(0);
  });

  test("后台编辑问答并落库", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${productId}/faq`);

    await page.getByLabel("问题(第 1 条)").fill("发货后多久到账?");
    await page.getByLabel("答案(第 1 条)").fill("支付成功后 5 分钟内发货,超时可联系 GM。");
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("已保存")).toBeVisible();

    const row = await prisma.productFaq.findFirstOrThrow({
      where: { productId },
      select: { answer: true },
    });
    expect(row.answer).toBe("支付成功后 5 分钟内发货,超时可联系 GM。");
  });

  test("后台排序:上移后顺序落库", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${productId}/faq`);

    await page.getByLabel("新增问题").fill("可以退款吗?");
    await page.getByLabel("新增答案").fill("发货后不支持退款。");
    await page.getByRole("button", { name: "新增" }).click();
    await expect(page.getByLabel("问题(第 2 条)")).toHaveValue("可以退款吗?");

    // 第 2 条上移 → 顺序反转
    await (await faqRow(page, "可以退款吗?")).getByRole("button", { name: "上移" }).click();

    await expect
      .poll(async () => {
        const rows = await prisma.productFaq.findMany({
          where: { productId },
          orderBy: { sort: "asc" },
          select: { question: true },
        });
        return rows.map((r) => r.question);
      })
      .toEqual(["可以退款吗?", "发货后多久到账?"]);
  });

  test("后台删除问答", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${productId}/faq`);

    await (await faqRow(page, "可以退款吗?")).getByRole("button", { name: "删除" }).click();
    await expect(page.getByLabel("问题(第 2 条)")).toHaveCount(0);
    await expect(page.getByLabel("问题(第 1 条)")).toHaveValue("发货后多久到账?");

    const remaining = await prisma.productFaq.findMany({
      where: { productId },
      select: { question: true },
    });
    expect(remaining.map((r) => r.question)).toEqual(["发货后多久到账?"]);
  });

  test("商城详情页展示常见问题", async ({ page }) => {
    await page.goto(`/shop/${SLUG_PREFIX}main`);
    const faq = page.getByTestId("product-faq");
    await expect(faq).toBeVisible();
    await expect(faq.getByText("发货后多久到账?")).toBeVisible();

    // 手风琴:展开后答案可见
    await faq.getByText("发货后多久到账?").click();
    await expect(faq.getByText(/支付成功后 5 分钟内发货/)).toBeVisible();
  });
});
