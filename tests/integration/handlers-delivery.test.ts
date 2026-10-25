import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { gameShaPassHash } from "@/lib/auth/game-hash";
import { loadSystemConfig } from "@/lib/config";
import { makePointsUser } from "../fixtures/shop-seed";
import { addToCart } from "@/server/services/shop/cart";
import { checkoutCart, CheckoutError } from "@/server/services/shop/checkout";
import { driveOrderDelivery } from "@/server/services/shop/delivery";

/**
 * T038 服务处理器集成(soap-mock 契约,quickstart S4/SC-106):
 * 每处理器 1 条 mock 实测订单——命令/参数照录 soap-delivery 映射表,幂等键
 * orderitem:{id}:1,状态闭环 completed;名字解锁落库规范化;目标账号不存在/
 * 占用名/离线恢复为支付前拦截(CheckoutError PRECHECK_FAILED,零写入,FR-120)。
 * SKU 是处理器路由键(product_sku_key 唯一):同 SKU 商品按 Map 复用,自建分类不依赖共享 fixture。
 */
const RUN = Date.now().toString(36);
const GUID_BASE = 880000 + (Number.parseInt(RUN, 36) % 60000);
const ENTRY_BASE = 991000 + (Number.parseInt(RUN, 36) % 8000);
const SLUG_PREFIX = `m4h-${RUN}-`;
const CATEGORY_SLUG = `m4h-cat-${RUN}`;
const gameUsernames: string[] = [];
const orderItemIds: bigint[] = [];
const restoreGuids: number[] = [];
let templateEntries: number[] = [];
let categoryId = 0n;
let MOCK_BASE = "";
const skuProducts = new Map<string, { id: bigint }>();

async function makeGameUser(tag: string) {
  const user = await makePointsUser("rich", tag);
  gameUsernames.push(user.username);
  const guid = GUID_BASE + gameUsernames.length;
  const charName = `V${gameUsernames.length}${RUN.slice(-5)}`;
  const account = await authDb.createAccount({
    username: user.username,
    email: `${user.username}@test.local`,
    shaPassHash: gameShaPassHash(user.username, "Handler123"),
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
  // 迁移后真实存量商品占用服务 SKU(char-change-* / item-restoration):复用已存在行
  const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) {
    skuProducts.set(sku, existing);
    return existing;
  }
  const created = await prisma.product.create({
    data: {
      sku,
      slug: `${SLUG_PREFIX}${sku}`,
      name: `处理器测试·${sku}`,
      description: "handler test",
      type: "service",
      status: "published",
      price: 100,
      categoryId,
    },
    select: { id: true },
  });
  skuProducts.set(sku, created);
  return created;
}

/** 一条订单走到发货完成,返回 {orderId, itemId, orderNo, item} */
async function buyAndDeliver(
  userId: bigint,
  productId: bigint,
  params: Record<string, unknown>,
) {
  const added = await addToCart({
    userId,
    productId,
    qty: 1,
    params: params as never,
  });
  if (!added.ok) throw new Error(`加购被拒: ${added.reason}`);
  const result = await checkoutCart(userId);
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: BigInt(result.orderId) },
    include: { items: true },
  });
  orderItemIds.push(order.items[0]!.id);
  await driveOrderDelivery(order.id);
  const item = await prisma.orderItem.findUniqueOrThrow({
    where: { id: order.items[0]!.id },
  });
  return {
    orderId: order.id,
    itemId: item.id,
    orderNo: order.orderNo,
    item,
  };
}

async function callOf(itemId: bigint) {
  return prisma.soapCall.findUniqueOrThrow({
    where: { idempotencyKey: `orderitem:${itemId}:1` },
  });
}

async function setMockMode(mode: "normal" | "failure") {
  const res = await fetch(`${MOCK_BASE}/__mode?mode=${mode}`);
  if (!res.ok) throw new Error(`soap-mock 不可达(${MOCK_BASE}),请先启动 docker dev 栈`);
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  MOCK_BASE = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await setMockMode("normal");
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  categoryId = (
    await prisma.productCategory.create({
      data: { name: `M4H 处理器 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;
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
  for (const itemId of orderItemIds) {
    const prefix = `orderitem:${itemId}:`;
    await prisma.soapCall.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
    await prisma.$executeRaw`
      DELETE FROM audit_log
      WHERE category = 'soap'
        AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.key')) LIKE ${`${prefix}%`}
    `;
  }
  await prisma.$executeRaw`
    DELETE FROM acore_characters.recovery_item
    WHERE Guid BETWEEN ${GUID_BASE} AND ${GUID_BASE + 9}
  `;
  if (templateEntries.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM acore_world.item_template
      WHERE entry BETWEEN ${ENTRY_BASE} AND ${ENTRY_BASE + 9}
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
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  await prisma.$disconnect();
});

describe("US4 服务处理器矩阵(T038)", () => {
  it("角色类四处理器:changerace/changefaction/customize/rename 命令与参数照录映射表", async () => {
    const { user, guid, charName } = await makeGameUser("chars");
    const cases = [
      ["char-change-race", ".character changerace"],
      ["char-change-faction", ".character changefaction"],
      ["char-change-customize", ".character customize"],
      ["char-change-name", ".character rename"],
    ] as const;
    for (const [sku, command] of cases) {
      const product = await makeServiceProduct(sku);
      const { itemId, item } = await buyAndDeliver(user.id, product.id, { characterGuid: guid });
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: item.orderId },
        include: { items: true },
      });
      expect(order.status, sku).toBe("completed");
      expect(item.deliveryStatus, sku).toBe("delivered");
      expect((item.params as { characterGuid: number }).characterGuid, sku).toBe(guid);

      const call = await callOf(itemId);
      expect(call.command, sku).toBe(command);
      expect(call.status, sku).toBe("success");
      expect(call.attempts, sku).toBe(1);
      expect(call.argsJson, sku).toEqual([charName]);
    }
  });

  it("名字解锁:全小写落库规范化为首字母大写,命令携带 NewName", async () => {
    const { user, guid, charName } = await makeGameUser("unlock");
    const product = await makeServiceProduct("name-unlock");
    const target = `gold${RUN.slice(-6)}`;
    const normalized = target.charAt(0).toUpperCase() + target.slice(1);

    const { itemId, item } = await buyAndDeliver(user.id, product.id, {
      characterGuid: guid,
      unlockName: target,
    });
    expect((item.params as { unlockName: string }).unlockName).toBe(normalized);
    const call = await callOf(itemId);
    expect(call.command).toBe(".character rename");
    expect(call.argsJson).toEqual([charName, normalized]);
  });

  it("名字解锁:占用名支付前拦截(PRECHECK_FAILED),零写入", async () => {
    const { user, guid, charName } = await makeGameUser("occupy");
    const product = await makeServiceProduct("name-unlock");
    await addToCart({
      userId: user.id,
      productId: product.id,
      qty: 1,
      params: { characterGuid: guid, unlockName: charName } as never,
    });

    const ordersBefore = await prisma.order.count({ where: { userId: user.id } });
    let err: unknown;
    try {
      await checkoutCart(user.id);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CheckoutError);
    expect((err as CheckoutError).code).toBe("PRECHECK_FAILED");
    expect((err as Error).message).toContain("占用");
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(ordersBefore);
  });

  it("角色转移/复制:destAccount 存在→命令携带目标账号;不存在→支付前拦截", async () => {
    const { user, guid, charName } = await makeGameUser("transfer");
    const dest = await makeGameUser("dest");
    const transfer = await makeServiceProduct("char-transfer");
    const clone = await makeServiceProduct("char-clone");

    const t = await buyAndDeliver(user.id, transfer.id, {
      characterGuid: guid,
      destAccount: dest.user.username,
    });
    expect((await callOf(t.itemId)).command).toBe(".character transfer");
    expect((await callOf(t.itemId)).argsJson).toEqual([charName, dest.user.username]);

    const c = await buyAndDeliver(user.id, clone.id, {
      characterGuid: guid,
      destAccount: dest.user.username,
    });
    expect((await callOf(c.itemId)).command).toBe(".character clone");
    expect((await callOf(c.itemId)).argsJson).toEqual([charName, dest.user.username]);

    // 不存在的目标账号:加购可入(schema 只做格式),结账前拦截
    await addToCart({
      userId: user.id,
      productId: transfer.id,
      qty: 1,
      params: { characterGuid: guid, destAccount: "no_such_acc" } as never,
    });
    const ordersBefore = await prisma.order.count({ where: { userId: user.id } });
    await expect(checkoutCart(user.id)).rejects.toThrow(/目标账号不存在/);
    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(ordersBefore);
  });

  it("公会变更:合法公会名命令照录;非法名加购即拒(PARAM_INVALID)", async () => {
    const { user, guid, charName } = await makeGameUser("guild");
    const product = await makeServiceProduct("guild-change");
    const { itemId } = await buyAndDeliver(user.id, product.id, {
      characterGuid: guid,
      guildName: "圣光远征军",
    });
    const call = await callOf(itemId);
    expect(call.command).toBe(".guild change");
    expect(call.argsJson).toEqual([charName, "圣光远征军"]);

    const rejected = await addToCart({
      userId: user.id,
      productId: product.id,
      qty: 1,
      params: { characterGuid: guid, guildName: "<bad>" } as never,
    });
    expect(rejected).toMatchObject({ ok: false, reason: "PARAM_INVALID" });
  });

  it("装备恢复:recovery 列表命中→.send items 邮寄恢复物品,状态闭环", async () => {
    const { user, guid, charName } = await makeGameUser("restore");
    const entry = ENTRY_BASE + 1;
    await prisma.$executeRaw`
      INSERT INTO acore_characters.recovery_item (Guid, ItemEntry) VALUES (${guid}, ${entry})
    `;
    await prisma.$executeRaw`
      INSERT INTO acore_world.item_template (entry, name, quality)
      VALUES (${entry}, '测试恢复装备', 3)
    `;
    restoreGuids.push(guid);
    templateEntries.push(entry);

    const product = await makeServiceProduct("item-restoration");
    const { itemId, item, orderNo } = await buyAndDeliver(user.id, product.id, {
      characterGuid: guid,
      restoreItemEntry: entry,
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: item.orderId },
      include: { items: true },
    });
    expect(order.status).toBe("completed");
    const call = await callOf(itemId);
    expect(call.command).toBe(".send items");
    const args = call.argsJson as string[];
    expect(args[0]).toBe(`--${charName}`);
    expect(args[3]).toBe(`${entry}:1`);
    expect(args.join(" ")).toContain(orderNo);
  });

  it("装备恢复离线拦截(FR-120):mock failure 态→支付前 PRECHECK_FAILED 零写入", async () => {
    const { user, guid } = await makeGameUser("offline");
    const entry = ENTRY_BASE + 2;
    await prisma.$executeRaw`
      INSERT INTO acore_characters.recovery_item (Guid, ItemEntry) VALUES (${guid}, ${entry})
    `;
    restoreGuids.push(guid);

    const product = await makeServiceProduct("item-restoration");
    await addToCart({
      userId: user.id,
      productId: product.id,
      qty: 1,
      params: { characterGuid: guid, restoreItemEntry: entry } as never,
    });

    const balanceBefore = (
      await prisma.pointAccount.findUniqueOrThrow({
        where: { userId: user.id },
        select: { balance: true },
      })
    ).balance;
    const ordersBefore = await prisma.order.count({ where: { userId: user.id } });

    await setMockMode("failure");
    try {
      let err: unknown;
      try {
        await checkoutCart(user.id);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(CheckoutError);
      expect((err as CheckoutError).code).toBe("PRECHECK_FAILED");
      expect((err as Error).message).toContain("服务器");
    } finally {
      await setMockMode("normal");
    }

    expect(await prisma.order.count({ where: { userId: user.id } })).toBe(ordersBefore);
    expect(
      (
        await prisma.pointAccount.findUniqueOrThrow({
          where: { userId: user.id },
          select: { balance: true },
        })
      ).balance,
    ).toBe(balanceBefore);
  });
});
