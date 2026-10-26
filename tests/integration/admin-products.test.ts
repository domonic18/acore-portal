import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS, PRODUCT_TYPE } from "@/constants/shop";
import { makePointsUser } from "../fixtures/shop-seed";
import { listProducts } from "@/server/services/catalog/products";
import {
  ProductAdminError,
  deleteProduct,
  listAdminProducts,
  saveProduct,
  setProductStatus,
} from "@/server/services/catalog/admin";
import { AUDIT_ACTION } from "@/constants/audit";
import { GameDbError } from "@/server/services/shared/game-identity";

const skuCheckState = vi.hoisted(() => ({ fail: false }));
vi.mock("@/server/services/catalog/sku-check", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/catalog/sku-check")>();
  return {
    ...actual,
    gameItemExists: async (entry: number) => {
      if (skuCheckState.fail) throw new GameDbError("物品模板库不可用");
      return actual.gameItemExists(entry);
    },
  };
});

/**
 * T045 商品保存校验集成(FR-126/127/128,quickstart S5.2/S5.3):
 * gameItemId world 不存在 422 SKU_GAME_ITEM_NOT_FOUND / 服务类未绑处理器 422
 * SKU_HANDLER_UNBOUND / 促销价≥原价 422 / sku·slug 重复 409 / world 不可达
 * GameDbError(路由层 503 拒绝保存);上下架目录隐藏+低库存查询。
 */
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `m5p-${RUN}-`;
const CATEGORY_SLUG = `m5p-cat-${RUN}`;
const usernames: string[] = [];
const DEL_ACTOR = 9_950_037_001n; // deleteProduct 审计 actor(无 FK,用后按 actor 清)
let categoryId = 0n;

function baseInput(overrides: Partial<Parameters<typeof saveProduct>[0]> = {}) {
  return {
    type: PRODUCT_TYPE.GAME_ITEM,
    sku: `itemsend_19019`,
    name: `后台测试商品 ${RUN}`,
    slug: `${SLUG_PREFIX}main`,
    description: "T045",
    categoryId,
    price: 100,
    stockEnabled: false,
    status: PRODUCT_STATUS.PUBLISHED,
    listed: true,
    gameItemId: 19019,
    ...overrides,
  } as Parameters<typeof saveProduct>[0];
}

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProductAdminError) return err.code;
    throw err;
  }
  throw new Error("expected ProductAdminError");
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  categoryId = (
    await prisma.productCategory.create({
      data: { name: `M5P 商品 ${RUN}`, slug: CATEGORY_SLUG, sort: 99 },
      select: { id: true },
    })
  ).id;
  usernames.push((await makePointsUser("rich", "adm")).username);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: DEL_ACTOR } });
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: `T${RUN}` } } });
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: CATEGORY_SLUG } });
  const users = await prisma.user.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.pointTransaction.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.pointAccount.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  }
  await prisma.$disconnect();
});

describe("US5 商品保存校验(T045,FR-126)", () => {
  it("gameItemId 在 world 不存在 → 422 SKU_GAME_ITEM_NOT_FOUND", async () => {
    expect(
      await errCode(saveProduct(baseInput({ gameItemId: 99999999, sku: `itemsend_99999999` }))),
    ).toBe("SKU_GAME_ITEM_NOT_FOUND");
  });

  it("服务类 SKU 未绑处理器 → 422 SKU_HANDLER_UNBOUND;命中注册表放行(itemsend_ 前缀即 ItemSendHandler)", async () => {
    expect(
      await errCode(
        saveProduct(
          baseInput({
            type: PRODUCT_TYPE.SERVICE,
            sku: "no-such-handler",
            gameItemId: null,
          }),
        ),
      ),
    ).toBe("SKU_HANDLER_UNBOUND");
    const saved = await saveProduct(
      baseInput({
        type: PRODUCT_TYPE.SERVICE,
        sku: `itemsend_svc${RUN}`,
        slug: `${SLUG_PREFIX}svc`,
        gameItemId: null,
      }),
    );
    expect(saved.id).toBeDefined();
  });

  it("促销价 ≥ 原价 → 422 SALE_PRICE_INVALID", async () => {
    expect(await errCode(saveProduct(baseInput({ salePrice: 100 })))).toBe("SALE_PRICE_INVALID");
    expect(await errCode(saveProduct(baseInput({ salePrice: 150 })))).toBe("SALE_PRICE_INVALID");
  });

  it("sku/slug 与既有商品冲突 → 409 DUPLICATE(自身更新不算冲突)", async () => {
    const anchor = await saveProduct(
      baseInput({ sku: `itemsend_d${RUN}a`, slug: `${SLUG_PREFIX}dup`, gameItemId: 19019 }),
    );
    expect(
      await errCode(
        saveProduct(
          baseInput({ sku: `itemsend_d${RUN}b`, slug: `${SLUG_PREFIX}dup`, gameItemId: 19019 }),
        ),
      ),
    ).toBe("DUPLICATE"); // slug 撞
    expect(
      await errCode(
        saveProduct(
          baseInput({ sku: `itemsend_d${RUN}a`, slug: `${SLUG_PREFIX}dup2`, gameItemId: 19019 }),
        ),
      ),
    ).toBe("DUPLICATE"); // sku 撞
    // 自身更新:同 sku 同 slug 不算冲突
    const self = await saveProduct(
      baseInput({ id: anchor.id, sku: `itemsend_d${RUN}a`, slug: `${SLUG_PREFIX}dup` }),
    );
    expect(self.id).toBe(anchor.id);
  });

  it("world 不可达 → GameDbError 传播(路由层 503 拒绝保存,不放行)", async () => {
    skuCheckState.fail = true;
    try {
      await expect(
        saveProduct(baseInput({ sku: `itemsend_w${RUN}`, gameItemId: 19020 })),
      ).rejects.toBeInstanceOf(GameDbError);
    } finally {
      skuCheckState.fail = false;
    }
  });

  it("合法保存→前台可见;上下架/目录隐藏(FR-127):draft 前台消失后台仍在,listed=false 直链语义", async () => {
    const { id } = await saveProduct(
      baseInput({
        sku: `itemsend_t${RUN}a`,
        slug: `${SLUG_PREFIX}toggle`,
        gameItemId: 19021,
      }),
    );
    const frontHit = await listProducts({ categorySlug: CATEGORY_SLUG });
    expect(frontHit.items.map((i) => i.slug)).toContain(`${SLUG_PREFIX}toggle`);

    await setProductStatus(id, PRODUCT_STATUS.DRAFT);
    const afterDraft = await listProducts({ categorySlug: CATEGORY_SLUG });
    expect(afterDraft.items.map((i) => i.slug)).not.toContain(`${SLUG_PREFIX}toggle`);
    const adminHit = await listAdminProducts({});
    expect(adminHit.items.map((i) => i.slug)).toContain(`${SLUG_PREFIX}toggle`);

    await setProductStatus(id, PRODUCT_STATUS.PUBLISHED, false);
    const afterUnlisted = await listProducts({ categorySlug: CATEGORY_SLUG });
    expect(afterUnlisted.items.map((i) => i.slug)).not.toContain(`${SLUG_PREFIX}toggle`);
    const adminAfter = await listAdminProducts({});
    const row = adminAfter.items.find((i) => i.slug === `${SLUG_PREFIX}toggle`);
    expect(row?.listed).toBe(false);
    expect(row?.status).toBe(PRODUCT_STATUS.PUBLISHED);
  });

  it("低库存查询(FR-128):stock ≤ threshold 命中,补货后退出", async () => {
    const { id } = await saveProduct(
      baseInput({
        sku: `itemsend_t${RUN}b`,
        slug: `${SLUG_PREFIX}lowstock`,
        gameItemId: 19020,
        stockEnabled: true,
        stock: 1,
        lowStockThreshold: 1,
      }),
    );
    const low = await listAdminProducts({ lowStock: true });
    expect(low.items.map((i) => i.slug)).toContain(`${SLUG_PREFIX}lowstock`);

    await prisma.product.update({ where: { id }, data: { stock: 5 } });
    const restocked = await listAdminProducts({ lowStock: true });
    expect(restocked.items.map((i) => i.slug)).not.toContain(`${SLUG_PREFIX}lowstock`);
  });
});

describe("deleteProduct(零订单删除/有订单拒绝)", () => {
  it("有订单拒绝且零写;零订单删除清购物车+审计", async () => {
    const buyer = await prisma.user.findUniqueOrThrow({
      where: { username: usernames[0]! },
      select: { id: true },
    });

    // 有订单:订单行是账务快照,拒绝删除且零写
    const ordered = await prisma.product.create({
      data: {
        type: PRODUCT_TYPE.GAME_ITEM,
        sku: `itemsend_t${RUN}o`,
        name: `待删有单商品 ${RUN}`,
        slug: `${SLUG_PREFIX}ordered`,
        description: "del",
        categoryId,
        price: 100,
        status: PRODUCT_STATUS.PUBLISHED,
        listed: true,
        gameItemId: 19019,
      },
      select: { id: true },
    });
    const order = await prisma.order.create({
      data: { orderNo: `T${RUN}ORD`, userId: buyer.id, pointCost: 100 },
      select: { id: true },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: ordered.id,
        sku: `itemsend_t${RUN}o`,
        name: `待删有单商品 ${RUN}`,
        unitPrice: 100,
        qty: 1,
        params: {},
      },
    });
    await expect(errCode(deleteProduct(ordered.id, DEL_ACTOR))).resolves.toBe(
      "PRODUCT_HAS_ORDERS",
    );
    expect(await prisma.product.findUnique({ where: { id: ordered.id } })).not.toBeNull();

    // 零订单:删除落库+购物车行随删+审计
    const target = await prisma.product.create({
      data: {
        type: PRODUCT_TYPE.GAME_ITEM,
        sku: `itemsend_t${RUN}d`,
        name: `待删零单商品 ${RUN}`,
        slug: `${SLUG_PREFIX}deleteme`,
        description: "del",
        categoryId,
        price: 50,
        status: PRODUCT_STATUS.PUBLISHED,
        listed: true,
        gameItemId: 19019,
      },
      select: { id: true },
    });
    await prisma.cartItem.create({
      data: { userId: buyer.id, productId: target.id, qty: 2, params: {} },
    });
    await deleteProduct(target.id, DEL_ACTOR);
    expect(await prisma.product.findUnique({ where: { id: target.id } })).toBeNull();
    expect(
      await prisma.cartItem.count({ where: { productId: target.id } }),
    ).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: DEL_ACTOR, action: AUDIT_ACTION.PRODUCT_DELETED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({
      productId: target.id.toString(),
      sku: `itemsend_t${RUN}d`,
    });

    // 不存在:NOT_FOUND
    await expect(errCode(deleteProduct(9_999_999n, DEL_ACTOR))).resolves.toBe("NOT_FOUND");
  });
});
