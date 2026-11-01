import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POINT_TX_TYPE } from "@/constants/points";
import { getPointsPage } from "@/server/services/points/view";

/**
 * 积分流水视图(issue #31/#32):
 * 商店消费备注补商品名×数量(按订单号回查),历史 mycred 备注的
 * %order_id% 占位符用 ref_id 回填,无 ref_id 时剥离占位符。
 */
const RUN = Date.now().toString(36);
const username = `t_${RUN}_pv`.slice(0, 32);
const orderNo = `M2E2E${RUN.toUpperCase()}`.slice(0, 32);
let userId: bigint;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `pvtest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true },
  });
  userId = user.id;

  const product = await prisma.product.findFirstOrThrow({ select: { id: true } });
  await prisma.pointAccount.create({ data: { userId, balance: 100 } });
  await prisma.order.create({
    data: {
      orderNo,
      userId,
      pointCost: 30,
      items: {
        create: [
          { productId: product.id, sku: "itemsend_1", name: "测试坐骑", unitPrice: 20, qty: 2, params: {} },
          { productId: product.id, sku: "itemsend_2", name: "测试宠物", unitPrice: 10, qty: 1, params: {} },
        ],
      },
    },
  });
  await prisma.pointTransaction.createMany({
    data: [
      {
        userId,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        amount: -30,
        balanceAfter: 100,
        remark: `订单 ${orderNo}`,
      },
      {
        userId,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        amount: -10,
        balanceAfter: 90,
        remark: "商店消费:%order_id%",
        refId: 9527n,
      },
      {
        userId,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        amount: -5,
        balanceAfter: 85,
        remark: "商店消费:%order_id%",
      },
      {
        userId,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        amount: -5,
        balanceAfter: 80,
        remark: "活动补偿",
      },
    ],
  });
});

afterAll(async () => {
  await prisma.pointTransaction.deleteMany({ where: { userId } });
  await prisma.order.deleteMany({ where: { userId } });
  await prisma.pointAccount.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { username } });
  await prisma.$disconnect();
});

describe("积分流水备注补充(#31/#32)", () => {
  it("订单备注补商品名×数量,%order_id% 用 ref_id 回填/无 ref_id 剥离,其它原样", async () => {
    const page = await getPointsPage(userId, 1);
    expect(page.balance).toBe(100);
    const remarks = page.transactions.map((t) => t.remark);

    expect(remarks).toEqual([
      "活动补偿",
      "商店消费",
      "商店消费:9527",
      `订单 ${orderNo} · 测试坐骑×2、测试宠物×1`,
    ]);
  });
});
