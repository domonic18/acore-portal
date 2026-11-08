import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 商品编辑台 E2E(两栏重构后的交互基线):
 * ① 物品类:选物品自动派生 SKU(只读),勾选堆叠后缀 _stack;
 * ② 服务类:下拉选发货处理器,SKU 即处理器键(无自由文本框);
 * ③ 高级区手改 SKU 与所选物品不一致 → 实时红字拦截保存;
 * ④ 服务端:服务类却带物品前缀 SKU → 422 SKU_TYPE_MISMATCH;
 * ⑤ 图片面板:设为主图 / 移除 / 媒体库插入,保存后 images 顺序落库。
 *
 * 物品 entry 取 19500+ 测试区间(见 scripts/dev/initdb/init-game-schemas.sql);
 * SKU 全局唯一 ⇒ 每个用例占用独立 entry。
 * 该区间按种子规则 stackable = (entry % 10 === 9 ? 20 : 1)⇒ 19519 可堆叠、19510 不可。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `e2epf-${RUN}-`;
const CATEGORY_SLUG = `e2epf-cat-${RUN}`;
const PICK_ENTRY = 19510;
const STACK_ENTRY = 19519;
const EDIT_ENTRY = 19520;
const MEDIA_NAME = `e2epf-media-${RUN}.png`;
const MEDIA_URL = `/images/e2epf-media-${RUN}.png`;
const FIRST_URL = `/images/e2epf-first-${RUN}.png`;
const SECOND_URL = `/images/e2epf-second-${RUN}.png`;

let categoryId = 0n;
let editProductId = 0n;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("m1admin");
  await page.getByLabel("密码", { exact: true }).fill("adminpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  await prisma.mediaAsset.deleteMany({ where: { cosKey: `media/${MEDIA_NAME}` } });

  categoryId = (
    await prisma.productCategory.create({
      data: { name: `E2E 编辑台 ${RUN}`, slug: CATEGORY_SLUG, sort: 98 },
      select: { id: true },
    })
  ).id;

  const admin = await prisma.user.findUniqueOrThrow({
    where: { username: "m1admin" },
    select: { id: true },
  });
  await prisma.mediaAsset.create({
    data: {
      cosKey: `media/${MEDIA_NAME}`,
      url: MEDIA_URL,
      originalName: MEDIA_NAME,
      category: "商店配图",
      sizeBytes: 1,
      mimeType: "image/png",
      uploadedBy: admin.id,
    },
  });

  editProductId = (
    await prisma.product.create({
      data: {
        sku: `itemsend_${EDIT_ENTRY}`,
        slug: `${SLUG_PREFIX}edit`,
        name: `E2E 编辑台商品 ${RUN}`,
        description: "图片面板用例",
        type: "game_item",
        status: "published",
        listed: true,
        price: 100,
        gameItemId: EDIT_ENTRY,
        categoryId,
        images: [FIRST_URL, SECOND_URL],
      },
      select: { id: true },
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  await prisma.mediaAsset.deleteMany({ where: { cosKey: `media/${MEDIA_NAME}` } });
  await prisma.$disconnect();
});

test.describe("商品编辑台(物品选择器 / SKU 派生 / 图片面板)", () => {
  test("物品类:选物品自动派生 SKU(只读),勾选堆叠加 _stack 后缀", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");

    await page.getByLabel("搜索游戏物品").fill(String(PICK_ENTRY));
    // 物品列表显示中文名(issue #151),英文名作副名并列
    await expect(page.getByTestId(`game-item-option-${PICK_ENTRY}`)).toContainText(
      `中文坐骑·${PICK_ENTRY}`,
    );
    await page.getByTestId(`game-item-option-${PICK_ENTRY}`).click();

    const sku = page.getByLabel("SKU", { exact: true });
    await expect(sku).toHaveValue(`itemsend_${PICK_ENTRY}`);
    await expect(sku).toHaveAttribute("readonly", "");

    await page.getByRole("switch", { name: "一封邮件发多个" }).click();
    await expect(sku).toHaveValue(`itemsend_${PICK_ENTRY}_stack`);
    await page.getByRole("switch", { name: "一封邮件发多个" }).click();
    await expect(sku).toHaveValue(`itemsend_${PICK_ENTRY}`);
  });

  test("物品选择器:可按中文名检索(issue #151)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");

    await page.getByLabel("搜索游戏物品").fill("中文坐骑");
    await expect(page.getByTestId(`game-item-option-${PICK_ENTRY}`)).toBeVisible();
  });

  test("可堆叠物品:自动勾选「一封邮件发多个」并派生 _stack SKU", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");

    await page.getByLabel("搜索游戏物品").fill(String(STACK_ENTRY));
    await page.getByTestId(`game-item-option-${STACK_ENTRY}`).click();

    await expect(page.getByRole("switch", { name: "一封邮件发多个" })).toBeChecked();
    await expect(page.getByLabel("SKU", { exact: true })).toHaveValue(
      `itemsend_${STACK_ENTRY}_stack`,
    );
    // 堆叠标记随选择器结果可见(品质色点 + 可堆叠角标)
    await expect(page.getByText(`可堆叠 ×20`)).toBeVisible();
  });

  test("服务类:下拉选处理器,SKU 自动取处理器键(只读)", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");

    await page.getByRole("group", { name: "商品类型" }).getByRole("button", { name: "服务类" }).click();
    const serviceSelect = page.getByLabel("服务类型", { exact: true });
    await serviceSelect.selectOption("char-change-name");
    await expect(serviceSelect).toHaveValue("char-change-name");
    // 服务类的 SKU 只是商品唯一标识:自动取处理器键,不可手改(发货依据是 handler_key)
    const sku = page.getByLabel("SKU", { exact: true });
    await expect(sku).toHaveValue("char-change-name");
    await expect(sku).toHaveAttribute("readonly", "");
  });

  test("高级区手改 SKU 与所选物品不一致 → 实时红字且拦下保存", async ({ page }) => {
    await login(page);
    await page.goto("/admin/products/new");

    await page.getByLabel("搜索游戏物品").fill(String(PICK_ENTRY));
    await page.getByTestId(`game-item-option-${PICK_ENTRY}`).click();
    await page.getByRole("button", { name: "高级:手动改写 SKU" }).click();

    const sku = page.getByLabel("SKU", { exact: true });
    await expect(sku).not.toHaveAttribute("readonly", "");
    await sku.fill("itemsend_19599");
    await expect(page.getByText(/与所选物品 .* 不一致/)).toBeVisible();

    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/new$/);
    await expect(page.getByText("有字段未通过校验,请检查标红的字段。")).toBeVisible();

    await page.getByRole("button", { name: "恢复自动生成" }).click();
    await expect(sku).toHaveValue(`itemsend_${PICK_ENTRY}`);
  });

  test("服务端:服务类却带物品前缀 SKU → 422 SKU_TYPE_MISMATCH", async ({ page }) => {
    await login(page);
    const res = await page.request.post("/api/admin/products", {
      data: {
        type: "service",
        sku: `itemsend_${EDIT_ENTRY}`,
        name: `E2E 类型错配 ${RUN}`,
        slug: `${SLUG_PREFIX}mismatch`,
        description: "",
        images: [],
        detailMd: "",
        categoryId: String(categoryId),
        price: 100,
        stockEnabled: false,
        gameItemId: null,
        status: "draft",
        listed: true,
      },
    });
    expect(res.status()).toBe(422);
    const body = (await res.json()) as { error?: { code?: string; field?: string } };
    expect(body.error?.code).toBe("SKU_TYPE_MISMATCH");
    expect(body.error?.field).toBe("sku");
  });

  test("图片面板:设为主图 / 移除 / 媒体库插入,保存后 images 顺序落库", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${editProductId}`);

    await expect(page.getByTestId("product-image-item-0")).toBeVisible();
    await expect(page.getByTestId("product-image-item-1")).toBeVisible();

    // 第 2 张设为主图 → 主图交换
    await page.getByTestId("product-image-item-1").getByRole("button", { name: "设为主图" }).click();
    // 交换后第 2 张是原第 1 张,移除它
    await page.getByTestId("product-image-item-1").getByRole("button", { name: "移除" }).click();
    await expect(page.getByTestId("product-image-item-1")).toHaveCount(0);

    // 媒体库选图追加
    await page.getByRole("button", { name: "从媒体库选择" }).click();
    await page.getByPlaceholder("搜索文件名…").fill(MEDIA_NAME);
    const item = page.getByText(MEDIA_NAME, { exact: true });
    await expect(item).toBeVisible();
    await item.locator("xpath=ancestor::li").getByRole("button", { name: "插入" }).click();
    await expect(page.getByTestId("product-image-item-1")).toBeVisible();

    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);

    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: editProductId },
      select: { images: true },
    });
    expect(saved.images).toEqual([SECOND_URL, MEDIA_URL]);
  });

  test("有未保存修改时给出提示", async ({ page }) => {
    await login(page);
    await page.goto(`/admin/products/${editProductId}`);
    await expect(page.getByText("尚未修改")).toBeVisible();
    await page.getByLabel("名称", { exact: true }).fill(`E2E 编辑台改名 ${RUN}`);
    await expect(page.getByText("有未保存的修改")).toBeVisible();
  });
});
