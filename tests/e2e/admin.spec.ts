import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T055 US5 运营后台 E2E(quickstart S5):
 * ① 越权:legacyuser 访问 /admin/products → 重定向首页(requireAdmin RSC 守卫);
 * ② 商品新建:m1admin 非法 gameItemId → 422 错误呈现;合法 itemsend_ → 列表可见;
 * ③ 补发:播种 delivery_failed 订单(char-change-name,charGuid 10)→ 详情补发 → completed;
 * ④ 积分手调:+50 → UI 余额更新 + manual_adjust 流水落库。
 * fixture:RUN 隔离直写;soap-mock 归正常态;用后还原(宪法 III 流水/余额同步清)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const SLUG_PREFIX = "e2eadm-";
const ORDER_NO = `M2E2E${RUN.toUpperCase().slice(-8)}A`;
const CATEGORY_SLUG = `${SLUG_PREFIX}cat-${RUN}`;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  // soap-mock 归位正常态(前序测试可能残留 failure/timeout)
  const soapUrl = (
    await prisma.$queryRaw<{ value: string }[]>`
      SELECT value FROM system_config WHERE \`key\` = 'soap.url' LIMIT 1`
  )[0]?.value;
  if (soapUrl) {
    await fetch(`${soapUrl.replace(/\/?$/, "")}/__mode?mode=normal`).catch(() => {});
  }
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  // 补发商品 SKU 固定,前轮残留(异常中断时非本前缀 slug 也会撞 unique)——按 sku 级联自愈
  // (order_item/cart_item→product 无 onDelete 级联,须先清子表;顺序照 afterAll)
  const staleItems = await prisma.orderItem.findMany({
    where: { product: { sku: "char-change-name" } },
    select: { id: true, orderId: true },
  });
  for (const item of staleItems) {
    await prisma.soapCall.deleteMany({
      where: { idempotencyKey: { startsWith: `orderitem:${item.id}:` } },
    });
  }
  await prisma.order.deleteMany({
    where: { id: { in: staleItems.map((i) => i.orderId) } },
  });
  const staleProducts = await prisma.product.findMany({
    where: { sku: "char-change-name" },
    select: { id: true },
  });
  await prisma.cartItem.deleteMany({ where: { productId: { in: staleProducts.map((p) => p.id) } } });
  await prisma.product.deleteMany({ where: { sku: "char-change-name" } });
  // 媒体分类 tab fixture(dev 库 media_asset 常空,种子 1 条使分类 tab 渲染)
  await prisma.mediaAsset.deleteMany({ where: { cosKey: { startsWith: "media/e2e-" } } });
  const admin = await prisma.user.findUniqueOrThrow({
    where: { username: "m1admin" },
    select: { id: true },
  });
  await prisma.mediaAsset.create({
    data: {
      cosKey: `media/e2e-${RUN}.png`,
      url: "/images/legacy-missing.svg",
      originalName: `e2e-media-${RUN}.png`,
      category: "商店配图",
      sizeBytes: 1,
      mimeType: "image/png",
      uploadedBy: admin.id,
    },
  });
});

test.afterAll(async () => {
  // 补发单:先清 soap 调用(FK),再删订单(级联行),最后商品/分类
  const orders = await prisma.order.findMany({
    where: { orderNo: ORDER_NO },
    select: { id: true, items: { select: { id: true } } },
  });
  for (const order of orders) {
    for (const item of order.items) {
      await prisma.soapCall.deleteMany({
        where: { idempotencyKey: { startsWith: `orderitem:${item.id}:` } },
      });
    }
  }
  await prisma.order.deleteMany({ where: { orderNo: ORDER_NO } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });

  // 手调还原:删本次 manual_adjust 流水 + 余额回拨(SUM 不变式同步)
  const legacy = await prisma.user.findUniqueOrThrow({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  const adjusted = await prisma.pointTransaction.deleteMany({
    where: { userId: legacy.id, type: "manual_adjust", remark: "E2E 后台手调" },
  });
  if (adjusted.count > 0) {
    await prisma.pointAccount.updateMany({
      where: { userId: legacy.id },
      data: { balance: 1_000_000 },
    });
  }
  await prisma.mediaAsset.deleteMany({ where: { cosKey: { startsWith: "media/e2e-" } } });
  await prisma.$disconnect();
});

test.describe("p12 后台外壳", () => {
  test("独立控制台:分组侧栏/面包屑/激活态,门户页头页脚不渲染", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");

    const shellNav = page.getByRole("navigation", { name: "后台导航" });
    await expect(shellNav).toBeVisible();
    for (const group of ["运营", "社区", "数据", "系统"]) {
      await expect(shellNav.getByText(group, { exact: true })).toBeVisible();
    }
    await expect(shellNav.getByRole("link", { name: "仪表盘" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("navigation", { name: "面包屑" })).toContainText("运营");
    // 门户 chrome 不出现在 /admin
    await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(0);
    await expect(page.locator("footer")).toHaveCount(0);

    await page.goto("/admin/settings");
    const crumb = page.getByRole("navigation", { name: "面包屑" });
    await expect(crumb.getByText("系统", { exact: true })).toBeVisible();
    await expect(crumb.getByText("设置", { exact: true })).toBeVisible();
    await expect(shellNav.getByRole("link", { name: "设置" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("US5 运营后台(T055)", () => {
  test("越权拒绝:user 访问后台页被 middleware 拦截回登录页(FR-125)", async ({ page }) => {
    await login(page, "legacyuser", "oldpass123");
    await page.goto("/admin/products");
    // edge 层先拦(role!=admin);RSC 深校验(redirect /+审计)由集成测试覆盖
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fproducts$/);
    await expect(page.getByRole("heading", { name: "运营后台" })).toHaveCount(0);
  });

  test("商品新建:非法 gameItemId 422 呈现;合法 SKU 保存入列表(FR-126)", async ({
    page,
  }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/products/new");

    await page.getByLabel(/游戏物品 ID/).fill("99999999");
    await page.getByLabel(/SKU/).fill("itemsend_bad");
    await page.getByLabel("名称").fill(`E2E 后台商品 ${RUN}`);
    await page.getByLabel(/别名 slug/).fill(`${SLUG_PREFIX}bad-${RUN}`);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("99999999 不存在")).toBeVisible();

    await page.getByLabel(/游戏物品 ID/).fill("19019");
    await page.getByLabel(/SKU/).fill(`itemsend_e2e${RUN}`);
    await page.getByLabel(/别名 slug/).fill(`${SLUG_PREFIX}good-${RUN}`);
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await expect(page.getByText(`E2E 后台商品 ${RUN}`)).toBeVisible();
  });

  test("商品表单图片编辑器与 Markdown 详情编辑器(WP 对齐)", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/products/new");
    // 图片编辑器:上传入口+媒体库选择(弹层出列表,默认「商店配图」分类)
    await expect(page.getByLabel("上传商品图片")).toBeVisible();
    await page.getByRole("button", { name: "从媒体库选择" }).click();
    await expect(page.getByPlaceholder("搜索文件名…")).toBeVisible();
    await expect(page.getByRole("tab", { name: /商店配图/ })).toBeVisible();
    await expect(page.getByText(`e2e-media-${RUN}.png`)).toBeVisible();
    // Markdown 编辑器:GFM 工具栏+粘贴上传提示
    await expect(page.getByRole("button", { name: "图片", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "媒体库…" })).toBeVisible();
    // 列表页有「图」列(缩略图/占位)
    await page.goto("/admin/products");
    await expect(page.getByRole("columnheader", { name: "图" })).toBeVisible();
    // 媒体管理页:上传可选 FileBird 分类
    await page.goto("/admin/media");
    await expect(page.getByLabel("上传分类")).toBeVisible();
    await expect(page.getByLabel("上传分类")).toContainText("商店配图");
  });

  test("补发:delivery_failed 订单重驱动为 completed(FR-129/SC-102)", async ({ page }) => {
    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const category = await prisma.productCategory.create({
      data: { name: `E2E 补发分类 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    });
    const product = await prisma.product.create({
      data: {
        sku: "char-change-name",
        slug: `${SLUG_PREFIX}rename-${RUN}`,
        name: `E2E 改名服务 ${RUN}`,
        description: "补发链路",
        type: "service",
        status: "published",
        price: 150,
        categoryId: category.id,
      },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: {
        orderNo: ORDER_NO,
        userId: legacy.id,
        status: "delivery_failed",
        pointCost: 150,
        paidAt: new Date(),
        deliveryError: "E2E 播种失败态",
        items: {
          create: {
            productId: product.id,
            sku: "char-change-name",
            name: `E2E 改名服务 ${RUN}`,
            unitPrice: 150,
            qty: 1,
            params: { characterGuid: 10 },
            deliveryStatus: "failed",
          },
        },
      },
      select: { id: true },
    });

    await login(page, "m1admin", "adminpass123");
    await page.goto(`/admin/orders/${order.id}`);
    await expect(page.getByText("发货异常", { exact: true })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "补发", exact: true }).click();

    await expect(page.getByText("已完成", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("已发货", { exact: true })).toBeVisible();
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.deliveryStatus).toBe("delivered");
  });

  test("积分手调:+50 入账,UI 余额与流水同步(FR-105)", async ({ page }) => {
    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const before =
      (
        await prisma.pointAccount.findUnique({
          where: { userId: legacy.id },
          select: { balance: true },
        })
      )?.balance ?? 0;

    await login(page, "m1admin", "adminpass123");
    await page.goto(`/admin/users/${legacy.id}`);
    await page.getByLabel(/数量/).fill("50");
    await page.getByLabel(/原因/).fill("E2E 后台手调");
    await page.getByRole("button", { name: "增加" }).click();

    await expect(page.getByText(`已调整,当前余额 ${before + 50}`)).toBeVisible();
    await expect(page.getByText(`余额 ${before + 50} 积分`)).toBeVisible();
    const flow = await prisma.pointTransaction.findFirstOrThrow({
      where: { userId: legacy.id, type: "manual_adjust", amount: 50, remark: "E2E 后台手调" },
    });
    expect(flow.balanceAfter).toBe(before + 50);
  });
});
