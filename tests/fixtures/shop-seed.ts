import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { PRODUCT_STATUS, PRODUCT_TYPE } from "@/constants/shop";

/**
 * M2 商城测试基座(T009;quickstart S1/S2 前置):
 * 幂等可重复(按 sku/slug upsert),afterAll 调 cleanupShopFixtures 回收。
 * 数据形态对齐 quickstart S2:2 分类+5 商品(3 物品类含促销档期+2 服务类)。
 */

const RUN = Date.now().toString(36);
const createdUsernames: string[] = [];

export const SHOP_FIXTURE = {
  categoryMountSlug: `mounts-${RUN}`,
  categoryServiceSlug: `services-${RUN}`,
  items: {
    inStock: "itemsend_19019", // 限量坐骑:库存 5,阈值 1
    onSale: "itemsend_19020", // 促销档期中:300→200
    saleExpired: "itemsend_19021", // 促销档期已过期:100(促销价 50 不生效)
  },
  services: {
    changeName: "char-change-name",
    nameUnlock: "name-unlock",
  },
} as const;

export type ShopUser = { id: bigint; username: string };

/** 建测试用户并直接置余额(绕过账本,只做测试前置;账本路径用例须走真实 credit) */
export async function makePointsUser(
  tier: "poor" | "mid" | "rich",
  tag: string,
): Promise<ShopUser> {
  const username = `m2_${RUN}_${tier}_${tag}`.slice(0, 32);
  const user = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      email: `${username}@test.local`,
      passwordHash: `m2test$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true, username: true },
  });
  const balance = tier === "poor" ? 10 : tier === "mid" ? 100 : 100000;
  await prisma.pointAccount.upsert({
    where: { userId: user.id },
    update: { balance },
    create: { userId: user.id, balance },
  });
  createdUsernames.push(username);
  return user;
}

function productCreate(
  sku: string,
  data: Omit<Prisma.ProductUncheckedCreateInput, "sku" | "slug">,
): Prisma.ProductUncheckedCreateInput {
  return { sku, slug: `m2-${sku.toLowerCase()}`, ...data };
}

export async function seedShopFixtures(): Promise<void> {
  const mountCat = await prisma.productCategory.upsert({
    where: { slug: SHOP_FIXTURE.categoryMountSlug },
    update: {},
    create: { name: "坐骑", slug: SHOP_FIXTURE.categoryMountSlug, sort: 1 },
  });
  const serviceCat = await prisma.productCategory.upsert({
    where: { slug: SHOP_FIXTURE.categoryServiceSlug },
    update: {},
    create: { name: "服务", slug: SHOP_FIXTURE.categoryServiceSlug, sort: 2 },
  });
  const now = Date.now();
  const itemBase = {
    categoryId: mountCat.id,
    status: PRODUCT_STATUS.PUBLISHED,
    type: PRODUCT_TYPE.GAME_ITEM,
    description: "M2 测试商品",
  } as const;
  const serviceBase = {
    categoryId: serviceCat.id,
    status: PRODUCT_STATUS.PUBLISHED,
    type: PRODUCT_TYPE.SERVICE,
    description: "M2 测试服务",
  } as const;

  const products: Prisma.ProductUncheckedCreateInput[] = [
    productCreate(SHOP_FIXTURE.items.inStock, {
      ...itemBase,
      name: "测试坐骑·限量",
      price: 500,
      stockEnabled: true,
      stock: 5,
      lowStockThreshold: 1,
      gameItemId: 19019,
    }),
    productCreate(SHOP_FIXTURE.items.onSale, {
      ...itemBase,
      name: "测试坐骑·促销中",
      price: 300,
      salePrice: 200,
      saleStart: new Date(now - 24 * 3600 * 1000),
      saleEnd: new Date(now + 24 * 3600 * 1000),
      gameItemId: 19020,
    }),
    productCreate(SHOP_FIXTURE.items.saleExpired, {
      ...itemBase,
      name: "测试坐骑·促销已过期",
      price: 100,
      salePrice: 50,
      saleStart: new Date(now - 48 * 3600 * 1000),
      saleEnd: new Date(now - 24 * 3600 * 1000),
      gameItemId: 19021,
    }),
    productCreate(SHOP_FIXTURE.services.changeName, {
      ...serviceBase,
      name: "测试服务·改名",
      price: 800,
    }),
    productCreate(SHOP_FIXTURE.services.nameUnlock, {
      ...serviceBase,
      name: "测试服务·名字解锁",
      price: 1200,
    }),
  ];
  for (const data of products) {
    await prisma.product.upsert({ where: { sku: data.sku }, update: {}, create: data });
  }
}

export async function cleanupShopFixtures(): Promise<void> {
  await prisma.cartItem.deleteMany({
    where: { user: { username: { in: createdUsernames } } },
  });
  await prisma.pointTransaction.deleteMany({
    where: { user: { username: { in: createdUsernames } } },
  });
  await prisma.pointAccount.deleteMany({
    where: { user: { username: { in: createdUsernames } } },
  });
  if (createdUsernames.length > 0) {
    await prisma.user.deleteMany({ where: { username: { in: createdUsernames } } });
  }
  const slugs = [
    SHOP_FIXTURE.categoryMountSlug,
    SHOP_FIXTURE.categoryServiceSlug,
    `m2-${SHOP_FIXTURE.items.inStock}`,
    `m2-${SHOP_FIXTURE.items.onSale}`,
    `m2-${SHOP_FIXTURE.items.saleExpired}`,
    `m2-${SHOP_FIXTURE.services.changeName}`,
    `m2-${SHOP_FIXTURE.services.nameUnlock}`,
  ];
  await prisma.product.deleteMany({ where: { slug: { in: slugs } } });
  await prisma.productCategory.deleteMany({ where: { slug: { in: slugs } } });
  createdUsernames.length = 0;
}
