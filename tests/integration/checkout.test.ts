import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { gameShaPassHash } from "@/lib/auth/game-hash";
import {
  cleanupShopFixtures,
  makePointsUser,
  seedShopFixtures,
  SHOP_FIXTURE,
} from "../fixtures/shop-seed";
import { addToCart } from "@/server/services/shop/cart";
import { checkoutCart } from "@/server/services/shop/checkout";
import { recalculateLedger } from "@/server/services/points/ledger";

/**
 * T028 结账单事务集成测试(research R2/quickstart S3):
 * 原子性=扣分+Order(paid)+行快照+条件扣库存+shop_payment 流水+清车;
 * 余额不足拦截无单无流水;双用户抢库存恰 1 成;同账户并发串行化无透支。
 * 并发两用例为确定性设计:同库同事务隔离级别下,条件扣减/互斥行锁保证分支结果,
 * 双线程场景用 Promise.allSettled 触发真实竞争。
 * 注:加购链含角色归属校验,结账用户须有游戏账号+自有角色(guid 按 RUN 基址隔离)。
 */
const RUN = Date.now().toString(36);
const extraSlugs: string[] = [];
const GUID_BASE = 850000 + (Number.parseInt(RUN, 36) % 90000);
const gameUsernames: string[] = [];

/** 积分用户 + 游戏账号 + 自有角色(归属校验前置条件);返回其角色 guid */
async function makeGameUser(tier: "poor" | "rich", tag: string): Promise<{ id: bigint; guid: number }> {
  const user = await makePointsUser(tier, tag);
  gameUsernames.push(user.username);
  const guid = GUID_BASE + gameUsernames.length;
  const account = await authDb.createAccount({
    username: user.username,
    email: `${user.username}@test.local`,
    shaPassHash: gameShaPassHash(user.username, "Checkout123"),
  });
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health)
    VALUES (${guid}, ${account.id}, ${`C${gameUsernames.length}${RUN.slice(-5)}`}, 1, 4, 0, 60, 0, 1519, 0, 4200)
  `;
  return { id: user.id, guid };
}

type InlineProduct = { id: bigint };

async function makeInlineProduct(
  tag: string,
  data: Partial<Prisma.ProductUncheckedCreateInput>,
): Promise<InlineProduct> {
  const slug = `m2checkout-${RUN}-${tag}`;
  const created = await prisma.product.create({
    data: {
      sku: data.sku ?? `itemsend_${19030 + tag.length}${tag.charCodeAt(0) % 10}`,
      slug,
      name: `结账测试·${tag}`,
      description: "checkout test",
      type: "game_item",
      status: "published",
      price: 100,
      categoryId: (
        await prisma.productCategory.findFirstOrThrow({
          where: { slug: SHOP_FIXTURE.categoryMountSlug },
          select: { id: true },
        })
      ).id,
      ...data,
    },
    select: { id: true },
  });
  extraSlugs.push(slug);
  return created;
}

/** 清引用 m2checkout- 商品的订单(级联行),再删商品——崩溃残留自愈 */
async function purgeCheckoutProducts() {
  const orders = await prisma.order.findMany({
    where: { items: { some: { product: { slug: { startsWith: "m2checkout-" } } } } },
    select: { id: true },
  });
  if (orders.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  }
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "m2checkout-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "m2checkout-" } } });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await purgeCheckoutProducts();
  await seedShopFixtures();
});

afterAll(async () => {
  // 清结账产生的订单/流水与购物车行,再删商品(FK)
  const users = await prisma.user.findMany({
    where: { username: { startsWith: `m2_${RUN}_` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cartItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await purgeCheckoutProducts();
  if (gameUsernames.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM acore_characters.characters
      WHERE guid BETWEEN ${GUID_BASE} AND ${GUID_BASE + gameUsernames.length}
    `;
    await prisma.$executeRaw`
      DELETE FROM acore_auth.account
      WHERE username IN (${Prisma.join(gameUsernames.map((u) => u.toUpperCase()))})
    `;
  }
  await cleanupShopFixtures();
  await prisma.$disconnect();
});

describe("US3 结账单事务(T028)", () => {
  it("原子闭环:扣分+paid 单+行快照+扣库存+流水+清车;促销按结算时刻生效价", async () => {
    const user = await makeGameUser("rich", "happy");
    const now = Date.now();
    const product = await makeInlineProduct("happy", {
      sku: `itemsend_19054`,
      price: 300,
      salePrice: 200,
      saleStart: new Date(now - 3600_000),
      saleEnd: new Date(now + 3600_000),
      stockEnabled: true,
      stock: 5,
      gameItemId: 19020,
    });
    await addToCart({ userId: user.id, productId: product.id, qty: 2, params: { characterGuid: user.guid } });

    const result = await checkoutCart(user.id);
    expect(result.orderNo).toMatch(/^M2\d{8}\d{6}$/);
    expect(result.pointCost).toBe(400); // 生效价 200×2,非原价 600

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(result.orderId) },
      include: { items: true },
    });
    expect(order.status).toBe("paid");
    expect(order.paidAt).not.toBeNull();
    expect(order.pointCost).toBe(400);
    expect(order.items).toHaveLength(1);
    const item = order.items[0]!;
    expect(item).toMatchObject({
      productId: product.id,
      sku: "itemsend_19054",
      unitPrice: 200,
      qty: 2,
      deliveryStatus: "pending",
    });
    expect(item.params).toEqual({ characterGuid: user.guid });

    const account = await prisma.pointAccount.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(account.balance).toBe(100_000 - 400);
    const flow = await prisma.pointTransaction.findFirstOrThrow({
      where: { userId: user.id, type: "shop_payment" },
    });
    expect(flow.amount).toBe(-400);
    expect(flow.balanceAfter).toBe(99_600);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(after.stock).toBe(3);

    expect(await prisma.cartItem.count({ where: { userId: user.id } })).toBe(0);

    // 账本不变式:余额=SUM(流水)
    const recalc = await recalculateLedger(user.id);
    expect(recalc.sum).toBe(-400);
  });

  it("余额不足 402:LedgerError 拦截,无单无流水,购物车原样", async () => {
    const user = await makeGameUser("poor", "poor");
    const product = await makeInlineProduct("poor", { price: 500, gameItemId: 19019 });
    await addToCart({ userId: user.id, productId: product.id, qty: 1, params: { characterGuid: user.guid } });

    await expect(checkoutCart(user.id)).rejects.toMatchObject({
      code: "INSUFFICIENT_BALANCE",
    });
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.pointTransaction.count({ where: { userId: user.id, type: "shop_payment" } }),
    ).toBe(0);
    expect(await prisma.cartItem.count({ where: { userId: user.id } })).toBe(1);
  });

  it("双用户抢库存 1:恰 1 单成功,失败侧 409 回滚无单", async () => {
    const u1 = await makeGameUser("rich", "race1");
    const u2 = await makeGameUser("rich", "race2");
    const product = await makeInlineProduct("race", {
      stockEnabled: true,
      stock: 1,
      gameItemId: 19019,
    });
    await addToCart({ userId: u1.id, productId: product.id, qty: 1, params: { characterGuid: u1.guid } });
    await addToCart({ userId: u2.id, productId: product.id, qty: 1, params: { characterGuid: u2.guid } });

    const results = await Promise.allSettled([checkoutCart(u1.id), checkoutCart(u2.id)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "OUT_OF_STOCK" });

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { stock: true },
    });
    expect(after.stock).toBe(0);
    const winners = await prisma.order.findMany({
      where: { userId: { in: [u1.id, u2.id] } },
      select: { userId: true },
    });
    expect(winners).toHaveLength(1);
  });

  it("同账户并发双结账:串行化恰 1 单,余额恰好扣一次无透支", async () => {
    const user = await makeGameUser("rich", "serial");
    const product = await makeInlineProduct("serial", { price: 100, gameItemId: 19019 });
    await addToCart({ userId: user.id, productId: product.id, qty: 1, params: { characterGuid: user.guid } });

    const results = await Promise.allSettled([checkoutCart(user.id), checkoutCart(user.id)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "CART_EMPTY" });

    const account = await prisma.pointAccount.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(account.balance).toBe(100_000 - 100);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(1);
  });

  it("空购物车 422 CART_EMPTY;车中商品已下架 422 PRODUCT_UNAVAILABLE 不动余额", async () => {
    const user = await makeGameUser("rich", "edge");
    await expect(checkoutCart(user.id)).rejects.toMatchObject({ code: "CART_EMPTY" });

    const product = await makeInlineProduct("unlist", { price: 100, gameItemId: 19019 });
    await addToCart({ userId: user.id, productId: product.id, params: { characterGuid: user.guid } });
    await prisma.product.update({
      where: { id: product.id },
      data: { status: "draft" },
    });
    await expect(checkoutCart(user.id)).rejects.toMatchObject({ code: "PRODUCT_UNAVAILABLE" });
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await prisma.pointTransaction.count({ where: { userId: user.id, type: "shop_payment" } }),
    ).toBe(0);
    expect(await prisma.cartItem.count({ where: { userId: user.id } })).toBe(1);
  });

  it("售罄行结账 409 OUT_OF_STOCK:事务回滚无单无扣分;单号序列同日递增", async () => {
    const user = await makeGameUser("rich", "soldout");
    const product = await makeInlineProduct("soldout", {
      stockEnabled: true,
      stock: 1,
      gameItemId: 19019,
    });
    await addToCart({ userId: user.id, productId: product.id, params: { characterGuid: user.guid } });
    // 加购后置零模拟"加购时有余、结账时售罄"(加购链本身拦截 stock<=0)
    await prisma.product.update({ where: { id: product.id }, data: { stock: 0 } });
    await expect(checkoutCart(user.id)).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(0);
    expect(await accountBalance(user.id)).toBe(100_000);
    // 失败事务回滚后购物车原样保留;移除售罄行以便续测序列
    await prisma.cartItem.deleteMany({ where: { userId: user.id } });

    // 序列递增:连续两单,尾 6 位递增
    const p2 = await makeInlineProduct("seq", { price: 10, gameItemId: 19019 });
    await addToCart({ userId: user.id, productId: p2.id, params: { characterGuid: user.guid } });
    const first = await checkoutCart(user.id);
    await addToCart({ userId: user.id, productId: p2.id, params: { characterGuid: user.guid } });
    const second = await checkoutCart(user.id);
    const seq1 = Number(first.orderNo.slice(-6));
    const seq2 = Number(second.orderNo.slice(-6));
    expect(seq2).toBe(seq1 + 1);
    expect(first.orderNo.slice(2, 10)).toBe(second.orderNo.slice(2, 10)); // 同日 YYYYMMDD
  });
});

async function accountBalance(userId: bigint): Promise<number> {
  const row = await prisma.pointAccount.findUniqueOrThrow({
    where: { userId },
    select: { balance: true },
  });
  return row.balance;
}
