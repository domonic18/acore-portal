import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getProductSales } from "@/server/services/stats/sales";
import { makePointsUser } from "../fixtures/shop-seed";

/**
 * 商品销量/热销榜(二期商城增强):按商品聚合销量与收入,
 * 排除已取消/已退款订单;收入=Σ(qty×下单快照价);支持 since 时间窗。
 */
const RUN = Date.now().toString(36);
const ORDER_PREFIX = `T${RUN}S`;
const PRODUCT_PREFIX = `sales-${RUN}-`;
const CATEGORY_SLUG = `sales-cat-${RUN}`;
const usernames: string[] = [];

let categoryId = 0n;
let userId = 0n;
let hotId = 0n;
let coldId = 0n;

async function makeOrder(
  tag: string,
  status: "completed" | "paid" | "cancelled" | "refunded",
  items: { productId: bigint; unitPrice: number; qty: number }[],
) {
  const order = await prisma.order.create({
    data: {
      orderNo: `${ORDER_PREFIX}${tag}`,
      userId,
      status,
      pointCost: items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
      ...(status === "completed" ? { completedAt: new Date() } : {}),
      ...(status === "paid" ? { paidAt: new Date() } : {}),
      ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
      ...(status === "refunded" ? { refundedAt: new Date() } : {}),
      items: {
        create: items.map((i) => ({
          productId: i.productId,
          sku: `sku-${i.productId}`,
          name: `sales item ${i.productId}`,
          unitPrice: i.unitPrice,
          qty: i.qty,
          params: {},
        })),
      },
    },
    select: { id: true },
  });
  return order.id;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: ORDER_PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PRODUCT_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });

  const user = await makePointsUser("rich", "sales");
  usernames.push(user.username);
  userId = user.id;

  categoryId = (
    await prisma.productCategory.create({
      data: { name: `销量测试 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;

  hotId = (
    await prisma.product.create({
      data: {
        type: "game_item",
        sku: `sales_hot_${RUN}`,
        slug: `${PRODUCT_PREFIX}hot`,
        name: `热销商品 ${RUN}`,
        description: "",
        categoryId,
        price: 100,
        status: "published",
        listed: true,
      },
      select: { id: true },
    })
  ).id;
  coldId = (
    await prisma.product.create({
      data: {
        type: "game_item",
        sku: `sales_cold_${RUN}`,
        slug: `${PRODUCT_PREFIX}cold`,
        name: `冷门商品 ${RUN}`,
        description: "",
        categoryId,
        price: 50,
        status: "published",
        listed: true,
      },
      select: { id: true },
    })
  ).id;

  // 有效:hot 2 件 + 1 件(两单),cold 1 件
  await makeOrder("A", "completed", [
    { productId: hotId, unitPrice: 100, qty: 2 },
    { productId: coldId, unitPrice: 50, qty: 1 },
  ]);
  await makeOrder("B", "paid", [{ productId: hotId, unitPrice: 100, qty: 1 }]);
  // 无效:取消/退款不计
  await makeOrder("C", "cancelled", [{ productId: hotId, unitPrice: 100, qty: 5 }]);
  await makeOrder("D", "refunded", [{ productId: coldId, unitPrice: 50, qty: 3 }]);
});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: ORDER_PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PRODUCT_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  if (users.length > 0) {
    const ids = users.map((u) => u.id);
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.pointTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

describe("getProductSales", () => {
  it("按销量排序,排除取消/退款,收入=Σ(qty×unitPrice)", async () => {
    const { totalUnits, top } = await getProductSales({ limit: 10 });
    expect(totalUnits).toBe(4);

    const hot = top.find((t) => t.productId === hotId.toString());
    const cold = top.find((t) => t.productId === coldId.toString());
    expect(hot).toMatchObject({ soldQty: 3, soldOrders: 2, revenue: 300 });
    expect(cold).toMatchObject({ soldQty: 1, soldOrders: 1, revenue: 50 });
    // 排序:销量降序
    expect(top[0]?.productId).toBe(hotId.toString());
  });

  it("limit 截断,不改变 totalUnits 全量口径", async () => {
    const { totalUnits, top } = await getProductSales({ limit: 1 });
    expect(top).toHaveLength(1);
    expect(top[0]?.productId).toBe(hotId.toString());
    expect(totalUnits).toBe(4);
  });

  it("since 时间窗过滤(未来时间→零)", async () => {
    const { totalUnits, top } = await getProductSales({
      limit: 10,
      since: new Date(Date.now() + 3600_000),
    });
    expect(top).toHaveLength(0);
    expect(totalUnits).toBe(0);
  });
});
