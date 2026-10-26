import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { srp6MakeRegistrationData } from "@/lib/auth/game-hash";
import { loadSystemConfig } from "@/lib/config";
import {
  cleanupShopFixtures,
  makePointsUser,
  seedShopFixtures,
  SHOP_FIXTURE,
} from "../fixtures/shop-seed";
import { addToCart } from "@/server/services/shop/cart";
import { checkoutCart } from "@/server/services/shop/checkout";
import { driveOrderDelivery, recoverStalledDeliveries } from "@/server/services/shop/delivery";

/**
 * T029 发货管线集成测试(soap-mock 契约,quickstart S3#1/2):
 * 成功→订单自动 completed 全程无人工(SC-102 前半);失败注入→delivery_failed 可见→
 * 补发成功闭环→重复补发幂等命中命令数不变;NO_HANDLER 防御拒绝;滞留 delivering 崩溃恢复扫描。
 * 每次调用落 soap_call(M1 机制);幂等键=orderitem:{item_id}:{attempt}(失败可重试,成功回放)。
 */
const RUN = Date.now().toString(36);
const GUID_BASE = 950000 + (Number.parseInt(RUN, 36) % 40000);
const ownedGuid = GUID_BASE;
const extraSlugs: string[] = [];
const gameUsernames: string[] = [];
const orderItemIds: bigint[] = [];
let MOCK_BASE = "";

async function makeGameUser(tag: string) {
  const user = await makePointsUser("rich", tag);
  gameUsernames.push(user.username);
  const guid = GUID_BASE + gameUsernames.length;
  const charName = `V${gameUsernames.length}${RUN.slice(-5)}`;
  const account = await authDb.createAccount({
    username: user.username,
    email: `${user.username}@test.local`,
    ...srp6MakeRegistrationData(user.username, "Delivery123"),
  });
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health)
    VALUES (${guid}, ${account.id}, ${charName}, 1, 4, 0, 60, 0, 1519, 0, 4200)
  `;
  return { user, guid, charName };
}

async function makeItemProduct(tag: string, data: Partial<Prisma.ProductUncheckedCreateInput>) {
  const slug = `m2delivery-${RUN}-${tag}`;
  const created = await prisma.product.create({
    data: {
      sku: data.sku ?? `itemsend_${19030 + tag.length}${tag.charCodeAt(0) % 10}`,
      slug,
      name: `发货测试·${tag}`,
      description: "delivery test",
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

async function checkoutOne(
  userId: bigint,
  productId: bigint,
  guid: number,
): Promise<{ orderId: bigint; itemId: bigint }> {
  await addToCart({ userId, productId, qty: 1, params: { characterGuid: guid } });
  const result = await checkoutCart(userId);
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: BigInt(result.orderId) },
    include: { items: { select: { id: true } } },
  });
  orderItemIds.push(order.items[0]!.id);
  return { orderId: order.id, itemId: order.items[0]!.id };
}

async function setMockMode(mode: "normal" | "timeout" | "failure") {
  const res = await fetch(`${MOCK_BASE}/__mode?mode=${mode}`);
  if (!res.ok) throw new Error(`soap-mock 不可达(${MOCK_BASE}),请先启动 docker dev 栈`);
}

async function setMockFail(command: string, on: boolean) {
  const res = await fetch(
    `${MOCK_BASE}/__fail?command=${encodeURIComponent(command)}&on=${on ? 1 : 0}`,
  );
  if (!res.ok) throw new Error(`soap-mock __fail 不可达,请确认已更新到含失败注入的版本`);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  MOCK_BASE = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await setMockMode("normal");
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "m2delivery-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "m2delivery-" } } });
  await seedShopFixtures();
});

afterAll(async () => {
  await setMockMode("normal");
  const users = await prisma.user.findMany({
    where: { username: { in: gameUsernames } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cartItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  // 发货幂等键与审计按本次 item id 精确清理
  for (const itemId of orderItemIds) {
    const prefix = `orderitem:${itemId}:`;
    await prisma.soapCall.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
    await prisma.$executeRaw`
      DELETE FROM audit_log
      WHERE category = 'soap'
        AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.key')) LIKE ${`${prefix}%`}
    `;
  }
  if (gameUsernames.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM acore_characters.characters
      WHERE guid BETWEEN ${GUID_BASE} AND ${GUID_BASE + 9}
    `;
    await prisma.$executeRaw`
      DELETE FROM acore_auth.account
      WHERE username IN (${Prisma.join(gameUsernames.map((u) => u.toUpperCase()))})
    `;
  }
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "m2delivery-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "m2delivery-" } } });
  await cleanupShopFixtures();
  await prisma.$disconnect();
});

describe("US3 发货管线(T029)", () => {
  it("发货成功:订单自动 completed(全程无人工),行 delivered 留 soap_call 审计;重复驱动幂等", async () => {
    const { user, guid, charName } = await makeGameUser("ok");
    const product = await makeItemProduct("ok", { stockEnabled: true, stock: 5 });
    const { orderId, itemId } = await checkoutOne(user.id, product.id, guid);

    await driveOrderDelivery(orderId);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    expect(order.status).toBe("completed");
    expect(order.completedAt).not.toBeNull();
    expect(order.deliveryError).toBeNull();
    const item = order.items[0]!;
    expect(item.deliveryStatus).toBe("delivered");
    expect(item.deliveredAt).not.toBeNull();
    expect(item.soapCallId).not.toBeNull();

    const call = await prisma.soapCall.findUniqueOrThrow({
      where: { id: item.soapCallId! },
    });
    expect(call.idempotencyKey).toBe(`orderitem:${itemId}:1`);
    expect(call.status).toBe("success");
    expect(call.command).toBe(".send items");
    expect(call.attempts).toBe(1);
    expect((call.argsJson as string[])[0]).toContain(charName);

    // 重复驱动(completed)→ 状态与命令数均不变
    await driveOrderDelivery(orderId);
    expect(
      await prisma.soapCall.count({ where: { idempotencyKey: { startsWith: `orderitem:${itemId}:` } } }),
    ).toBe(1);
  });

  it("失败注入→delivery_failed+deliveryError 可见;补发成功→completed;再次补发幂等命中命令数不变", async () => {
    const { user, guid } = await makeGameUser("retry");
    const product = await makeItemProduct("retry", { stockEnabled: true, stock: 5 });
    const { orderId, itemId } = await checkoutOne(user.id, product.id, guid);

    await setMockFail(".send items", true);
    await driveOrderDelivery(orderId);
    let order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(order.status).toBe("delivery_failed");
    expect(order.deliveryError).toContain("mock injected failure");
    expect(order.items[0]!.deliveryStatus).toBe("failed");
    const failedAttempts = (
      await prisma.soapCall.findUniqueOrThrow({ where: { idempotencyKey: `orderitem:${itemId}:1` } })
    ).attempts;
    expect(failedAttempts).toBeGreaterThanOrEqual(1);

    // 补发(重试/后台补发路径):解除注入重新驱动
    await setMockFail(".send items", false);
    await driveOrderDelivery(orderId);
    order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(order.status).toBe("completed");
    expect(order.items[0]!.deliveryStatus).toBe("delivered");
    expect(order.deliveryError).toBeNull();

    // 幂等命中:成功后再驱动不新增命令
    const callsBefore = await prisma.soapCall.count({
      where: { idempotencyKey: { startsWith: `orderitem:${itemId}:` } },
    });
    await driveOrderDelivery(orderId);
    expect(
      await prisma.soapCall.count({ where: { idempotencyKey: { startsWith: `orderitem:${itemId}:` } } }),
    ).toBe(callsBefore);
  }, 30_000);

  it("非堆叠多件=逐封单件邮寄,堆叠多件=一封多件(WP 口径,防 CreateItem 超栈钳制)", async () => {
    const { user, guid, charName } = await makeGameUser("multi");
    const plain = await makeItemProduct("multi", { sku: `itemsend_1907${RUN.length}` });
    const stack = await makeItemProduct("multistack", { sku: `itemsend_9007${RUN.length}_stack` });

    // 非堆叠 qty=2:两封各 1 个
    await addToCart({ userId: user.id, productId: plain.id, qty: 2, params: { characterGuid: guid } });
    const r1 = await checkoutCart(user.id);
    const o1 = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(r1.orderId) },
      include: { items: true },
    });
    orderItemIds.push(o1.items[0]!.id);
    await driveOrderDelivery(o1.id);

    // 堆叠 qty=3:一封 3 个
    await addToCart({ userId: user.id, productId: stack.id, qty: 3, params: { characterGuid: guid } });
    const r2 = await checkoutCart(user.id);
    const o2 = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(r2.orderId) },
      include: { items: true },
    });
    orderItemIds.push(o2.items[0]!.id);
    await driveOrderDelivery(o2.id);

    const plainCalls = await prisma.soapCall.findMany({
      where: { idempotencyKey: { startsWith: `orderitem:${o1.items[0]!.id}:` } },
      orderBy: { id: "asc" },
    });
    expect(plainCalls).toHaveLength(2);
    for (const call of plainCalls) {
      expect(call.status).toBe("success");
      expect(call.command).toBe(".send items");
      const args = call.argsJson as string[];
      expect(args[0]).toBe(charName);
      expect(args[3]).toMatch(/:1$/);
    }
    expect(plainCalls[0]!.idempotencyKey).toBe(`orderitem:${o1.items[0]!.id}:1:m0`);
    expect(plainCalls[1]!.idempotencyKey).toBe(`orderitem:${o1.items[0]!.id}:1:m1`);

    const stackCalls = await prisma.soapCall.findMany({
      where: { idempotencyKey: { startsWith: `orderitem:${o2.items[0]!.id}:` } },
    });
    expect(stackCalls).toHaveLength(1);
    expect((stackCalls[0]!.argsJson as string[])[3]).toMatch(/:3$/);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: o1.id } })).status).toBe("completed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o2.id } })).status).toBe("completed");
  });

  it("多封重试防重发:历史已成功封数计入,只补差额", async () => {
    const { user, guid } = await makeGameUser("diff");
    const product = await makeItemProduct("diff", { sku: `itemsend_1908${RUN.length}` });
    await addToCart({ userId: user.id, productId: product.id, qty: 2, params: { characterGuid: guid } });
    const result = await checkoutCart(user.id);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(result.orderId) },
      include: { items: true },
    });
    const itemId = order.items[0]!.id;
    orderItemIds.push(itemId);
    const requestedBy = `order:${order.id}:item:${itemId}`;

    // 预置第 1 封已成功(模拟部分成功后的重试场景)
    await prisma.soapCall.create({
      data: {
        idempotencyKey: `orderitem:${itemId}:1:m0`,
        command: ".send items",
        argsJson: ["预置", '"t"', '"t"', "1900:1"],
        status: "success",
        attempts: 1,
        requestedBy,
      },
    });

    await driveOrderDelivery(order.id);

    const calls = await prisma.soapCall.findMany({
      where: { idempotencyKey: { startsWith: `orderitem:${itemId}:` } },
    });
    expect(calls).toHaveLength(2); // 预置 1 封 + 本次只补 1 封,不重发
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("completed");
  });

  it("NO_HANDLER 防御:未注册 SKU 行 failed,订单 delivery_failed", async () => {
    const { user } = await makeGameUser("nohandler");
    // 防御路径无法经加购到达(加购即拒),直接构造 paid 单+行
    const order = await prisma.order.create({
      data: {
        orderNo: `M2TEST${RUN.toUpperCase()}NH`,
        userId: user.id,
        status: "paid",
        pointCost: 100,
        paidAt: new Date(),
        items: {
          create: {
            productId: (
              await prisma.product.findFirstOrThrow({ select: { id: true } })
            ).id,
            sku: "unknown-service",
            name: "未注册服务",
            unitPrice: 100,
            qty: 1,
            params: { characterGuid: ownedGuid },
          },
        },
      },
      include: { items: true },
    });
    orderItemIds.push(order.items[0]!.id);

    await driveOrderDelivery(order.id);

    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(after.status).toBe("delivery_failed");
    expect(after.deliveryError).toContain("DELIVERY_NO_HANDLER");
    expect(after.items[0]!.deliveryStatus).toBe("failed");
  });

  it("崩溃恢复:滞留 delivering 的订单被扫描重新驱动至 completed", async () => {
    const { user, guid } = await makeGameUser("stall");
    const product = await makeItemProduct("stall", { stockEnabled: true, stock: 5 });
    const { orderId } = await checkoutOne(user.id, product.id, guid);

    // 模拟进程崩溃残留:状态推到 delivering 且超时
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "delivering",
        deliveringAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    await recoverStalledDeliveries();

    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.status).toBe("completed");
  });
});
