import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { srp6MakeRegistrationData } from "@/lib/auth/game-hash";
import { loadSystemConfig } from "@/lib/config";
import { POINT_TX_TYPE } from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { makePointsUser } from "../fixtures/shop-seed";
import { debitLedger } from "@/server/services/points/ledger";
import { addToCart } from "@/server/services/shop/cart";
import { checkoutCart } from "@/server/services/shop/checkout";
import { driveOrderDelivery } from "@/server/services/shop/delivery";
import {
  OrderAdminError,
  redeliverOrder,
  refundOrder,
} from "@/server/services/orders/admin";
import { adjustPoints } from "@/server/services/points/adjust";
import { grantBadge } from "@/server/services/users-admin/admin";

/**
 * T046 订单/用户后台服务集成(api-admin 契约,quickstart S5.4):
 * 补发:失败单重驱动→completed,重复补发拒绝且不新增命令(幂等,SC-102);
 * 退款:shop_payment 正向回补流水(remark=订单退款 #orderNo)+库存回补+refunded+审计含前后余额;
 * 积分手调 402 语义(负余额拦截);徽章重复授予 409(badge_reward 流水 amount 读 point_rule)。
 */
const RUN = Date.now().toString(36);
const GUID_BASE = 850000 + (Number.parseInt(RUN, 36) % 60000);
const SLUG_PREFIX = `m5o-${RUN}-`;
const CATEGORY_SLUG = `m5o-cat-${RUN}`;
const gameUsernames: string[] = [];
const usernames: string[] = [];
let categoryId = 0n;
let operatorId = 0n;
let MOCK_BASE = "";
const skuProducts = new Map<string, { id: bigint }>();

async function makeGameUser(tag: string) {
  const user = await makePointsUser("rich", tag);
  gameUsernames.push(user.username);
  const guid = GUID_BASE + gameUsernames.length;
  const charName = `W${gameUsernames.length}${RUN.slice(-5)}`;
  const account = await authDb.createAccount({
    username: user.username,
    email: `${user.username}@test.local`,
    ...srp6MakeRegistrationData(user.username, "Handler123"),
  });
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health)
    VALUES (${guid}, ${account.id}, ${charName}, 1, 4, 0, 60, 0, 1519, 0, 4200)
  `;
  return { user, guid, charName };
}

async function makeServiceProduct(sku: string) {
  const hit = skuProducts.get(sku);
  if (hit) return hit;
  const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  const created =
    existing ??
    (
      await prisma.product.create({
        data: {
          sku,
          slug: `${SLUG_PREFIX}${sku}`,
          name: `后台测试·${sku}`,
          description: "T046",
          type: "service",
          status: "published",
          price: 100,
          categoryId,
        },
        select: { id: true },
      })
    );
  skuProducts.set(sku, created);
  return created;
}

async function setMockMode(mode: "normal" | "failure") {
  const res = await fetch(`${MOCK_BASE}/__mode?mode=${mode}`);
  if (!res.ok) throw new Error(`soap-mock 不可达(${MOCK_BASE}),请先启动 docker dev 栈`);
}

async function countCalls(itemId: bigint) {
  return prisma.soapCall.count({
    where: { idempotencyKey: { startsWith: `orderitem:${itemId}:` } },
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  MOCK_BASE = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await setMockMode("normal");
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  categoryId = (
    await prisma.productCategory.create({
      data: { name: `M5O 订单 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;
  const operator = await makePointsUser("rich", "op");
  usernames.push(operator.username);
  operatorId = operator.id;
});

afterAll(async () => {
  await setMockMode("normal");
  const all = await prisma.user.findMany({
    where: { username: { in: [...gameUsernames, ...usernames] } },
    select: { id: true },
  });
  const userIds = all.map((u) => u.id);
  if (userIds.length > 0) {
    await prisma.badgeGrant.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointTransaction.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.cartItem.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.badge.deleteMany({ where: { name: { startsWith: `M5O徽章-${RUN}` } } });
  if (userIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        actorUserId: { in: userIds },
        action: {
          in: [
            AUDIT_ACTION.ORDER_REDELIVER,
            AUDIT_ACTION.ORDER_REFUND,
            AUDIT_ACTION.BADGE_GRANT,
          ],
        },
      },
    });
  }
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
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
  await prisma.$disconnect();
});

describe("US5 订单/用户后台服务(T046)", () => {
  it("补发:mock failure 发货失败→normal 补发闭环 completed;重复补发拒绝且零新增命令", async () => {
    const { user, guid } = await makeGameUser("redeliver");
    const product = await makeServiceProduct("char-change-customize");
    const added = await addToCart({
      userId: user.id,
      productId: product.id,
      qty: 1,
      params: { characterGuid: guid } as never,
    });
    expect(added.ok).toBe(true);
    const { orderId } = await checkoutCart(user.id);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: BigInt(orderId) },
      include: { items: true },
    });
    const itemId = order.items[0]!.id;

    await setMockMode("failure");
    try {
      await driveOrderDelivery(order.id);
    } finally {
      await setMockMode("normal");
    }
    const failedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(failedOrder.status).toBe("delivery_failed");
    expect((await countCalls(itemId))).toBe(1);

    const result = await redeliverOrder(order.id, operatorId);
    expect(result.items.map((i) => i.deliveryStatus)).toEqual(["delivered"]);
    const done = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(done.status).toBe("completed");
    expect(await countCalls(itemId)).toBe(2); // 失败 1 次+补发 1 次,无重复命令

    // 非 delivery_failed 拒绝补发(completed 已终态);命令数不再增长
    await expect(redeliverOrder(order.id, operatorId)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
    expect(await countCalls(itemId)).toBe(2);
    const audits = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.ORDER_REDELIVER, category: AUDIT_CATEGORY.ADMIN },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("退款:completed 单回补积分(shop_payment 正向流水)+库存回补+refunded+审计前后余额", async () => {
    const { user } = await makeGameUser("refund");
    usernames.push(user.username);
    const product = await prisma.product.create({
      data: {
        sku: `itemsend_r${RUN}`,
        slug: `${SLUG_PREFIX}refund-item`,
        name: `退款回补商品 ${RUN}`,
        description: "T046",
        type: "game_item",
        status: "published",
        price: 300,
        stockEnabled: true,
        stock: 3, // 模拟已扣 5-2
        lowStockThreshold: 1,
        gameItemId: 19019,
        categoryId,
      },
      select: { id: true },
    });
    const orderNo = `M2T${RUN.toUpperCase()}R1`;
    await debitLedger(prisma, {
      userId: user.id,
      amount: 300,
      type: POINT_TX_TYPE.SHOP_PAYMENT,
      remark: `订单 ${orderNo}`,
    });
    const balanceBefore = (
      await prisma.pointAccount.findUniqueOrThrow({
        where: { userId: user.id },
        select: { balance: true },
      })
    ).balance;
    const order = await prisma.order.create({
      data: {
        orderNo,
        userId: user.id,
        status: "completed",
        pointCost: 300,
        paidAt: new Date(),
        completedAt: new Date(),
        items: {
          create: [
            { productId: product.id, sku: "itemsend_19019", name: "退款回补商品", unitPrice: 300, qty: 2, params: {} },
          ],
        },
      },
      select: { id: true },
    });

    const result = await refundOrder(order.id, operatorId);
    expect(result.balanceAfter).toBe(balanceBefore + 300);
    const refunded = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(refunded.status).toBe("refunded");
    expect(refunded.refundedAt).not.toBeNull();
    const flow = await prisma.pointTransaction.findFirstOrThrow({
      where: { userId: user.id, type: POINT_TX_TYPE.SHOP_PAYMENT, amount: 300 },
    });
    expect(flow.remark).toContain(`订单退款 #${orderNo}`);
    expect(flow.refType).toBe("order");
    const stock = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stock.stock).toBe(5);
    const refundAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.ORDER_REFUND },
      orderBy: { id: "desc" },
    });
    const payload = refundAudit.payloadJson as Prisma.JsonObject;
    expect(payload.before).toBe(balanceBefore);
    expect(payload.after).toBe(balanceBefore + 300);

    // 终态不可再退
    await expect(refundOrder(order.id, operatorId)).rejects.toMatchObject({
      code: "INVALID_STATUS",
    });
  });

  it("积分手调:扣至负余额拦截(402 语义 insufficient_balance),零写入", async () => {
    const { user } = await makeGameUser("adjust402");
    usernames.push(user.username);
    const before = (
      await prisma.pointAccount.findUniqueOrThrow({
        where: { userId: user.id },
        select: { balance: true },
      })
    ).balance;
    const outcome = await adjustPoints({
      userId: user.id,
      amount: -(before + 1),
      reason: "测试负余额拦截",
      operatorId,
    });
    expect(outcome).toEqual({ ok: false, reason: "insufficient_balance" });
    const after = (
      await prisma.pointAccount.findUniqueOrThrow({
        where: { userId: user.id },
        select: { balance: true },
      })
    ).balance;
    expect(after).toBe(before);
    const flows = await prisma.pointTransaction.count({
      where: { userId: user.id, type: POINT_TX_TYPE.MANUAL_ADJUST },
    });
    expect(flows).toBe(0);
  });

  it("徽章授予:badge_reward 流水 amount 读 point_rule;重复授予 409 语义", async () => {
    const { user } = await makeGameUser("badge");
    usernames.push(user.username);
    const badge = await prisma.badge.create({
      data: { name: `M5O徽章-${RUN}-勇者`, level: 3, description: "T046" },
      select: { id: true },
    });
    // 临时调规则值,验证流水 amount 来自 point_rule 而非硬编码
    const rule = await prisma.pointRule.findUniqueOrThrow({ where: { event: "badge_grant" } });
    await prisma.pointRule.update({ where: { id: rule.id }, data: { amount: 5 } });
    try {
      const first = await grantBadge({ userId: user.id, badgeId: badge.id, operatorId });
      if (!first.ok) throw new Error("grant should succeed");
      expect(first.amount).toBe(5);
      const flow = await prisma.pointTransaction.findFirstOrThrow({
        where: { userId: user.id, type: POINT_TX_TYPE.BADGE_REWARD },
      });
      expect(flow.amount).toBe(5);
      expect(flow.balanceAfter).toBe(
        (
          await prisma.pointAccount.findUniqueOrThrow({
            where: { userId: user.id },
            select: { balance: true },
          })
        ).balance,
      );
      const grant = await prisma.badgeGrant.findFirstOrThrow({
        where: { userId: user.id, badgeId: badge.id },
      });
      expect(grant.pointTransactionId).toBe(flow.id);

      const duplicate = await grantBadge({ userId: user.id, badgeId: badge.id, operatorId });
      expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
      expect(
        await prisma.badgeGrant.count({ where: { userId: user.id, badgeId: badge.id } }),
      ).toBe(1);
    } finally {
      await prisma.pointRule.update({ where: { id: rule.id }, data: { amount: rule.amount } });
    }
  });
});
