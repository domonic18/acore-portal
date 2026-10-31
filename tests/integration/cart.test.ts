import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { srp6MakeRegistrationData } from "@/lib/auth/game-hash";
import {
  cleanupShopFixtures,
  makePointsUser,
  seedShopFixtures,
  SHOP_FIXTURE,
  type ShopUser,
} from "../fixtures/shop-seed";
import {
  addToCart,
  removeCartItem,
  updateCartItem,
} from "@/server/services/shop/cart";

/**
 * T018 集成测试(US2 购物车;quickstart S2.3-5):
 * 加购校验链 published→SKU 参数矩阵(FR-120)→角色归属 403+审计→售罄 409;
 * 同商品同参数合并行;PATCH 售罄增数 409/DELETE 404 防枚举。
 * 游戏 fixture:自建 auth 账号+characters 行(guid 段按 RUN 隔离)。
 */
const RUN = Date.now().toString(36);
const GUID_BASE = 900000 + (Number.parseInt(RUN, 36) % 90000);
const ownedGuid = GUID_BASE;
const otherGuid = GUID_BASE + 1;

const extraSlugs: string[] = [];
const gameUsernames: string[] = [];

async function makeCartUser(tag: string, withGame: boolean): Promise<ShopUser> {
  const user = await makePointsUser("rich", tag);
  if (withGame) {
    gameUsernames.push(user.username);
    const account = await authDb.createAccount({
      username: user.username,
      email: `${user.username}@test.local`,
      ...srp6MakeRegistrationData(user.username, "Cartpass123"),
    });
    await prisma.$executeRaw`
      INSERT INTO acore_characters.characters
        (guid, account, name, race, class, gender, level, map, zone, online, health)
      VALUES
        (${GUID_BASE}, ${account.id}, ${"C" + tag}, 1, 4, 0, 60, 0, 1519, 0, 4200),
        (${GUID_BASE + 1}, ${account.id}, ${"D" + tag}, 7, 8, 1, 60, 0, 1519, 0, 2900)
    `;
  }
  return user;
}

type InlineProduct = { id: bigint };

async function makeInlineProduct(
  tag: string,
  data: Partial<Prisma.ProductUncheckedCreateInput>,
): Promise<InlineProduct> {
  // 迁移后真实存量商品占用固定服务 SKU(如 item-restoration):按 sku 复用已存在行
  const sku = (data.sku as string | undefined) ?? `m2cart_${RUN}_${tag}`.slice(0, 64);
  const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) return existing;
  const slug = `m2cart-${RUN}-${tag}`;
  const created = await prisma.product.create({
    data: {
      sku: `m2cart_${RUN}_${tag}`.slice(0, 64),
      slug,
      name: `测试商品·${tag}`,
      description: "cart test",
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

async function serviceCategoryId(): Promise<bigint> {
  return (
    await prisma.productCategory.findFirstOrThrow({
      where: { slug: SHOP_FIXTURE.categoryServiceSlug },
      select: { id: true },
    })
  ).id;
}

let cartUser: ShopUser;
let noGameUser: ShopUser;
let inStockId: bigint;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  // 清理历史崩溃运行遗留(sku 恒定如 item-restoration,slug 带 RUN 每轮不同)
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: "m2cart-" } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: "m2cart-" } } });
  await seedShopFixtures();
  inStockId = (
    await prisma.product.findUniqueOrThrow({
      where: { sku: SHOP_FIXTURE.items.inStock },
      select: { id: true },
    })
  ).id;
  cartUser = await makeCartUser("owner", true);
  noGameUser = await makeCartUser("nogame", false);
});

afterAll(async () => {
  // 先清购物车行(内联商品 + fixture inStock 上的行)再删商品,避免 FK
  await prisma.cartItem.deleteMany({
    where: { OR: [{ product: { slug: { in: extraSlugs } } }, { productId: inStockId }] },
  });
  await prisma.product.deleteMany({ where: { slug: { in: extraSlugs } } });
  await cleanupShopFixtures();
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

describe("US2 加购校验链(T018)", () => {
  it("成功加购:行参数落库;同参数合并行,不同参数独立行", async () => {
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: inStockId,
        qty: 1,
        params: { characterGuid: ownedGuid },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: inStockId,
        qty: 1,
        params: { characterGuid: ownedGuid },
      }),
    ).toMatchObject({ ok: true, cartCount: 1 });

    const merged = await prisma.cartItem.findMany({
      where: { userId: cartUser.id, productId: inStockId },
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.qty).toBe(2);
    expect(merged[0]!.params).toEqual({ characterGuid: ownedGuid });

    await addToCart({
      userId: cartUser.id,
      productId: inStockId,
      qty: 1,
      params: { characterGuid: otherGuid },
    });
    expect(await prisma.cartItem.count({ where: { userId: cartUser.id } })).toBe(2);
  });

  it("商品不存在/未发布拒绝", async () => {
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: 987654321n,
        params: { characterGuid: ownedGuid },
      }),
    ).toEqual({ ok: false, reason: "PRODUCT_NOT_FOUND" });

    const draft = await makeInlineProduct("draft", { status: "draft" });
    expect(
      await addToCart({ userId: cartUser.id, productId: draft.id, params: { characterGuid: ownedGuid } }),
    ).toEqual({ ok: false, reason: "NOT_PUBLISHED" });
  });

  it("SKU 参数矩阵:缺 characterGuid/未知键/装备恢复缺 restoreItemEntry/未注册服务 SKU → 拒绝(FR-120)", async () => {
    expect(
      await addToCart({ userId: cartUser.id, productId: inStockId, params: {} }),
    ).toEqual({ ok: false, reason: "PARAM_INVALID" });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: inStockId,
        params: { characterGuid: ownedGuid, foo: 1 },
      }),
    ).toEqual({ ok: false, reason: "PARAM_INVALID" });

    const restore = await makeInlineProduct("restore", {
      type: "service",
      sku: "item-restoration",
      slug: `m2cart-${RUN}-restore`,
      categoryId: await serviceCategoryId(),
    });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: restore.id,
        params: { characterGuid: ownedGuid },
      }),
    ).toEqual({ ok: false, reason: "PARAM_INVALID" });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: restore.id,
        params: { characterGuid: ownedGuid, restoreItemEntry: 19019 },
      }),
    ).toMatchObject({ ok: true });

    const unknownSku = await makeInlineProduct("unregistered", { type: "service" });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: unknownSku.id,
        params: { characterGuid: ownedGuid },
      }),
    ).toEqual({ ok: false, reason: "NO_HANDLER" });
  });

  it("角色归属:他人 guid → CHARACTER_NOT_OWNED+ownership_violation 审计;无游戏账号同样拒绝", async () => {
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: inStockId,
        params: { characterGuid: 424242 },
      }),
    ).toEqual({ ok: false, reason: "CHARACTER_NOT_OWNED" });
    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: cartUser.id, action: "ownership_violation" },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.payloadJson as { scope?: string }).scope).toBe("cart_add");

    expect(
      await addToCart({
        userId: noGameUser.id,
        productId: inStockId,
        params: { characterGuid: ownedGuid },
      }),
    ).toEqual({ ok: false, reason: "CHARACTER_NOT_OWNED" });
  });

  it("售罄拦截:stock=0 加购拒绝;PATCH 售罄增数拒绝减数放行", async () => {
    const stockZero = await makeInlineProduct("stockzero", {
      sku: "itemsend_19022",
      stockEnabled: true,
      stock: 0,
      lowStockThreshold: 1,
      gameItemId: 19022,
    });
    expect(
      await addToCart({
        userId: cartUser.id,
        productId: stockZero.id,
        params: { characterGuid: ownedGuid },
      }),
    ).toEqual({ ok: false, reason: "OUT_OF_STOCK" });

    const patchOut = await makeInlineProduct("patchout", {
      sku: "itemsend_19023",
      stockEnabled: true,
      stock: 2,
      gameItemId: 19023,
    });
    await addToCart({
      userId: cartUser.id,
      productId: patchOut.id,
      qty: 1,
      params: { characterGuid: ownedGuid },
    });
    const row = await prisma.cartItem.findFirstOrThrow({
      where: { userId: cartUser.id, productId: patchOut.id },
    });
    await prisma.product.update({ where: { id: patchOut.id }, data: { stock: 0 } });
    expect(await updateCartItem({ userId: cartUser.id, itemId: row.id, qty: 3 })).toEqual({
      ok: false,
      reason: "OUT_OF_STOCK",
    });
    expect(await updateCartItem({ userId: cartUser.id, itemId: row.id, qty: 1 })).toMatchObject({
      ok: true,
    });
    expect(await updateCartItem({ userId: cartUser.id, itemId: row.id, qty: 0 })).toEqual({
      ok: false,
      reason: "QTY_INVALID",
    });
  });

  it("DELETE 防枚举:他人行/不存在行一律 NOT_FOUND;本人行移除生效", async () => {
    const other = await makePointsUser("mid", "other");
    const foreignRow = await prisma.cartItem.create({
      data: { userId: other.id, productId: inStockId, qty: 1, params: { characterGuid: 1 } },
      select: { id: true },
    });
    expect(await removeCartItem({ userId: cartUser.id, itemId: foreignRow.id })).toEqual({
      ok: false,
      reason: "CART_ITEM_NOT_FOUND",
    });
    expect(await removeCartItem({ userId: cartUser.id, itemId: 987654321n })).toEqual({
      ok: false,
      reason: "CART_ITEM_NOT_FOUND",
    });

    const own = await prisma.cartItem.findFirstOrThrow({
      where: { userId: cartUser.id },
      select: { id: true },
    });
    expect(await removeCartItem({ userId: cartUser.id, itemId: own.id })).toMatchObject({ ok: true });
    expect(await prisma.cartItem.count({ where: { id: own.id } })).toBe(0);
  });
});
