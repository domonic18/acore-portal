import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS, PRODUCT_TYPE } from "@/constants/shop";
import { makePointsUser } from "../fixtures/shop-seed";
import { getProductDetail, listProducts } from "@/server/services/catalog/products";
import {
  ProductAdminError,
  batchSetProducts,
  deleteProduct,
  duplicateProduct,
  getAdminProduct,
  listAdminProducts,
  saveProduct,
  setProductStatus,
  updateProductQuickEdit,
} from "@/server/services/catalog/admin";
import { AUDIT_ACTION } from "@/constants/audit";
import { GameDbError } from "@/server/services/shared/game-identity";

const skuCheckState = vi.hoisted(() => ({ fail: false }));
vi.mock("@/server/services/catalog/game-items", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/services/catalog/game-items")>();
  return {
    ...actual,
    getGameItem: async (entry: number) => {
      if (skuCheckState.fail) throw new GameDbError("物品模板库不可用");
      return actual.getGameItem(entry);
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

// 物品 entry 取自 19500+ 专用测试区间(见 scripts/dev/initdb/init-game-schemas.sql):
// SKU 唯一 ⇒ 每个商品需要一个独立且真实存在的物品 entry。
// 种子规则:区间内 entry % 10 = 9 的物品 stackable=20(可堆叠)⇒ SKU 必须带 _stack。
const ITEM_ENTRY_BASE = 19500;
let entryCursor = ITEM_ENTRY_BASE;
function allocEntry(): number {
  return entryCursor++;
}

/** 按种子规则派生物品类 SKU(可堆叠物品须带 _stack,否则服务端报 SKU_STACK_REQUIRED) */
function skuFor(entry: number): string {
  return entry % 10 === 9 ? `itemsend_${entry}_stack` : `itemsend_${entry}`;
}

/** 取一个不可堆叠的 entry(变形/transmog SKU 不带 _stack,须配不可堆叠物品) */
function allocPlainEntry(): number {
  while (entryCursor % 10 === 9) entryCursor += 1;
  return entryCursor++;
}

/** 取一个可堆叠的 entry(种子规则:entry % 10 = 9 ⇒ stackable=20) */
function allocStackEntry(): number {
  while (entryCursor % 10 !== 9) entryCursor += 1;
  return entryCursor++;
}

function baseInput(overrides: Partial<Parameters<typeof saveProduct>[0]> = {}) {
  return {
    type: PRODUCT_TYPE.GAME_ITEM,
    sku: `itemsend_19019`,
    name: `后台测试商品 ${RUN}`,
    slug: `${SLUG_PREFIX}main`,
    description: "T045",
    images: [],
    detailMd: null,
    categoryId,
    price: 100,
    stockEnabled: false,
    status: PRODUCT_STATUS.PUBLISHED,
    listed: true,
    gameItemId: 19019,
    ...overrides,
  } as Parameters<typeof saveProduct>[0];
}

/** 物品类夹具:SKU 必须与所选物品一致(新契约),entry 从测试区间分配 */
function itemInput(entry: number, overrides: Partial<Parameters<typeof saveProduct>[0]> = {}) {
  return baseInput({ ...overrides, sku: skuFor(entry), gameItemId: entry });
}

/** 服务类夹具:SKU 只是唯一标识,发货依据取 handler_key(默认角色转种族) */
function serviceInput(sku: string, overrides: Partial<Parameters<typeof saveProduct>[0]> = {}) {
  return baseInput({
    ...overrides,
    type: PRODUCT_TYPE.SERVICE,
    sku,
    handlerKey: overrides.handlerKey === undefined ? "char-change-race" : overrides.handlerKey,
    gameItemId: null,
  });
}

// 服务类 SKU 全局唯一(注册表只有 6 个键,且种子商品已占用其中 5 个):
// 测试夹具走 -copy-N 派生形态(SKU 已是纯标识,可自定义),数字后缀保证跨用例/跨运行唯一。
let serviceCursor = 0;
function serviceKey(): string {
  serviceCursor += 1;
  return `char-change-race-copy-${serviceCursor}`;
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

/** 断言错误码与落点字段(前端据此做字段级定位) */
async function errDetail(
  promise: Promise<unknown>,
): Promise<{ code: string; field?: string }> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ProductAdminError) return { code: err.code, field: err.field };
    throw err;
  }
  throw new Error("expected ProductAdminError");
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.cartItem.deleteMany({ where: { product: { slug: { startsWith: SLUG_PREFIX } } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  // 清掉上次异常中断残留的测试商品(本文件专用 entry 区间与服务夹具 SKU 族):
  // 残留会让下次运行的 SKU 唯一约束撞车
  const stale = await prisma.product.findMany({
    where: {
      OR: [
        { sku: { startsWith: "itemsend_195" } },
        { sku: { startsWith: "char-change-race-copy-" } },
      ],
    },
    select: { id: true },
  });
  if (stale.length > 0) {
    const staleIds = stale.map((p) => p.id);
    await prisma.orderItem.deleteMany({ where: { productId: { in: staleIds } } });
    await prisma.cartItem.deleteMany({ where: { productId: { in: staleIds } } });
    await prisma.product.deleteMany({ where: { id: { in: staleIds } } });
  }
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

  it("SKU ↔ 物品ID 交叉校验:不一致 → SKU_ITEM_MISMATCH(发货按 SKU 解析物品,错号会静默发错货)", async () => {
    const entry = allocEntry();
    const other = allocEntry();
    const err = await errDetail(
      saveProduct(
        baseInput({ sku: `itemsend_${other}`, gameItemId: entry, slug: `${SLUG_PREFIX}xmatch` }),
      ),
    );
    expect(err.code).toBe("SKU_ITEM_MISMATCH");
    expect(err.field).toBe("sku");
  });

  it("SKU 格式非法 → SKU_FORMAT_INVALID;物品类未选物品 → SKU_GAME_ITEM_REQUIRED", async () => {
    expect(
      await errCode(
        saveProduct(
          baseInput({ sku: "itemsend_abc", gameItemId: allocEntry(), slug: `${SLUG_PREFIX}xfmt` }),
        ),
      ),
    ).toBe("SKU_FORMAT_INVALID");
    const err = await errDetail(
      saveProduct(
        baseInput({ sku: "", gameItemId: null, slug: `${SLUG_PREFIX}xnoitem` }),
      ),
    );
    expect(err.code).toBe("SKU_GAME_ITEM_REQUIRED");
    expect(err.field).toBe("gameItemId");
  });

  it("物品类 SKU 可为 transmog-item_{id};_stack 形态同样放行", async () => {
    const entry = allocPlainEntry();
    const transmog = await saveProduct(
      baseInput({
        sku: `transmog-item_${entry}`,
        gameItemId: entry,
        slug: `${SLUG_PREFIX}xtransmog`,
      }),
    );
    expect(transmog.id).toBeDefined();
    const stack = await saveProduct(
      baseInput({
        sku: `itemsend_${entry}_stack`,
        gameItemId: entry,
        slug: `${SLUG_PREFIX}xstack`,
      }),
    );
    expect(stack.id).toBeDefined();
  });

  it("可堆叠物品缺 _stack 后缀 → 422 SKU_STACK_REQUIRED(否则多件会发多封邮件)", async () => {
    const entry = allocStackEntry();
    const err = await errDetail(
      saveProduct(
        baseInput({ sku: `itemsend_${entry}`, gameItemId: entry, slug: `${SLUG_PREFIX}xstackmiss` }),
      ),
    );
    expect(err.code).toBe("SKU_STACK_REQUIRED");
    expect(err.field).toBe("sku");
  });

  it("服务类副本 SKU(-copy)仍可保存(存量副本须可编辑)", async () => {
    const saved = await saveProduct(
      serviceInput(serviceKey(), { slug: `${SLUG_PREFIX}xcopy` }),
    );
    expect(saved.id).toBeDefined();
  });

  it("服务类未绑处理器 → 422 SKU_HANDLER_UNBOUND;物品类前缀 → SKU_TYPE_MISMATCH;副本 SKU 放行", async () => {
    expect(
      await errCode(
        saveProduct(
          serviceInput(serviceKey(), {
            slug: `${SLUG_PREFIX}svc-unbound`,
            handlerKey: "no-such-handler",
          }),
        ),
      ),
    ).toBe("SKU_HANDLER_UNBOUND");
    // 未选处理器 → 拒绝(SKU 已退化为纯标识,发货靠 handler_key)
    expect(
      await errCode(
        saveProduct(
          serviceInput(serviceKey(), { slug: `${SLUG_PREFIX}svc-nokey`, handlerKey: null }),
        ),
      ),
    ).toBe("SKU_HANDLER_UNBOUND");
    // 服务类不得用物品类前缀(发货按 SKU 前缀路由,类型与处理器必须一致)
    expect(
      await errCode(
        saveProduct(
          serviceInput(`itemsend_${allocEntry()}`, { slug: `${SLUG_PREFIX}svc-prefix` }),
        ),
      ),
    ).toBe("SKU_TYPE_MISMATCH");
    const saved = await saveProduct(
      serviceInput(serviceKey(), { slug: `${SLUG_PREFIX}svc` }),
    );
    expect(saved.id).toBeDefined();
  });

  it("促销价 ≥ 原价 → 422 SALE_PRICE_INVALID", async () => {
    expect(await errCode(saveProduct(baseInput({ salePrice: 100 })))).toBe("SALE_PRICE_INVALID");
    expect(await errCode(saveProduct(baseInput({ salePrice: 150 })))).toBe("SALE_PRICE_INVALID");
  });

  it("sku/slug 与既有商品冲突 → 409 DUPLICATE(自身更新不算冲突)", async () => {
    const entryA = allocEntry();
    const entryB = allocEntry();
    const anchor = await saveProduct(
      itemInput(entryA, { slug: `${SLUG_PREFIX}dup` }),
    );
    expect(
      await errCode(
        saveProduct(
          itemInput(entryB, { slug: `${SLUG_PREFIX}dup` }),
        ),
      ),
    ).toBe("DUPLICATE"); // slug 撞
    expect(
      await errCode(
        saveProduct(
          itemInput(entryA, { slug: `${SLUG_PREFIX}dup2` }),
        ),
      ),
    ).toBe("DUPLICATE"); // sku 撞
    // 自身更新:同 sku 同 slug 不算冲突
    const self = await saveProduct(
      itemInput(entryA, { id: anchor.id, slug: `${SLUG_PREFIX}dup` }),
    );
    expect(self.id).toBe(anchor.id);
  });

  it("world 不可达 → GameDbError 传播(路由层 503 拒绝保存,不放行)", async () => {
    skuCheckState.fail = true;
    try {
      await expect(
        saveProduct(itemInput(allocEntry(), { slug: `${SLUG_PREFIX}world-down` })),
      ).rejects.toBeInstanceOf(GameDbError);
    } finally {
      skuCheckState.fail = false;
    }
  });

  it("合法保存→前台可见;上下架/目录隐藏(FR-127):draft 前台消失后台仍在,listed=false 直链语义", async () => {
    const { id } = await saveProduct(
      itemInput(allocEntry(), {
        slug: `${SLUG_PREFIX}toggle`,
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
      itemInput(allocEntry(), {
        slug: `${SLUG_PREFIX}lowstock`,
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

/**
 * 后台商品列表筛选(#152 搜索框 + #156 类别筛选):
 * q 命中名称/slug/SKU,type 命中物品类/服务类,categoryId 命中所属分类,
 * 三者与 lowStock 可叠加;非法 type 回落为不限。
 */
describe("listAdminProducts 筛选(#152/#156)", () => {
  const itemSlug = `${SLUG_PREFIX}filt-item`;
  const svcSlug = `${SLUG_PREFIX}filt-svc`;

  beforeAll(async () => {
    await saveProduct(
      itemInput(allocPlainEntry(), {
        slug: itemSlug,
        name: `筛选测试物品 ${RUN}`,
      }),
    );
    await saveProduct(
      serviceInput(serviceKey(), {
        slug: svcSlug,
        name: `筛选测试服务 ${RUN}`,
      }),
    );
  });

  it("q 按名称命中", async () => {
    const hit = await listAdminProducts({ q: "筛选测试物品" });
    expect(hit.items.map((i) => i.slug)).toContain(itemSlug);
    expect(hit.items.map((i) => i.slug)).not.toContain(svcSlug);
  });

  it("q 按 slug 命中", async () => {
    const hit = await listAdminProducts({ q: svcSlug });
    expect(hit.items.map((i) => i.slug)).toContain(svcSlug);
  });

  it("q 按 SKU 命中", async () => {
    const sku = (await listAdminProducts({ q: "筛选测试物品" })).items.find(
      (i) => i.slug === itemSlug,
    )?.sku;
    expect(sku).toBeTruthy();
    const hit = await listAdminProducts({ q: sku! });
    expect(hit.items.map((i) => i.slug)).toContain(itemSlug);
  });

  it("type 区分物品类与服务类", async () => {
    const items = await listAdminProducts({ type: PRODUCT_TYPE.GAME_ITEM, q: "筛选测试" });
    expect(items.items.map((i) => i.slug)).toContain(itemSlug);
    expect(items.items.map((i) => i.slug)).not.toContain(svcSlug);

    const services = await listAdminProducts({ type: PRODUCT_TYPE.SERVICE, q: "筛选测试" });
    expect(services.items.map((i) => i.slug)).toContain(svcSlug);
    expect(services.items.map((i) => i.slug)).not.toContain(itemSlug);
  });

  it("非法 type 回落为不限(不因枚举非法而报错)", async () => {
    const all = await listAdminProducts({ type: "__bogus__", q: "筛选测试" });
    expect(all.items.map((i) => i.slug)).toEqual(
      expect.arrayContaining([itemSlug, svcSlug]),
    );
  });

  it("categoryId 命中所属分类", async () => {
    const hit = await listAdminProducts({ categoryId });
    expect(hit.items.map((i) => i.slug)).toContain(itemSlug);
    const miss = await listAdminProducts({ categoryId: categoryId + 999_999n });
    expect(miss.items.map((i) => i.slug)).not.toContain(itemSlug);
  });

  it("筛选与低库存可叠加", async () => {
    const hit = await listAdminProducts({ lowStock: true, q: "筛选测试" });
    // 夹具未启用库存 ⇒ 不属低库存
    expect(hit.items.map((i) => i.slug)).not.toContain(itemSlug);
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

describe("批量上下架与复制(二期商城增强)", () => {
  it("batchSetProducts:批量下架/目录隐藏生效并落聚合审计", async () => {
    const a = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}batch-a` }),
    );
    const b = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}batch-b` }),
    );

    expect(await batchSetProducts([a.id, b.id], "draft", DEL_ACTOR)).toEqual({ updated: 2 });
    const drafted = await prisma.product.findMany({
      where: { id: { in: [a.id, b.id] } },
      select: { status: true },
    });
    expect(drafted.every((r) => r.status === PRODUCT_STATUS.DRAFT)).toBe(true);

    expect(await batchSetProducts([a.id], "unlist", DEL_ACTOR)).toEqual({ updated: 1 });
    const listed = await prisma.product.findUniqueOrThrow({
      where: { id: a.id },
      select: { listed: true },
    });
    expect(listed.listed).toBe(false);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: DEL_ACTOR, action: AUDIT_ACTION.PRODUCT_BATCH_UPDATED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({ action: "unlist", count: 1 });
  });

  it("duplicateProduct:服务类生成 -copy 草稿副本,重名追加序号;物品类拒绝", async () => {
    const sourceSku = serviceKey();
    const source = await saveProduct(
      serviceInput(sourceSku, {
        slug: `${SLUG_PREFIX}dup-src`,
        price: 250,
        maxPerUser: 2,
        stockEnabled: true,
        stock: 9,
        salePrice: 200,
      }),
    );

    const first = await duplicateProduct(source.id, DEL_ACTOR);
    const copy1 = await prisma.product.findUniqueOrThrow({ where: { id: first.id } });
    expect(copy1.sku).toBe(`${sourceSku}-copy`);
    expect(copy1.slug).toBe(`${SLUG_PREFIX}dup-src-copy`);
    expect(copy1.status).toBe(PRODUCT_STATUS.DRAFT);
    expect(copy1.listed).toBe(true);
    expect(copy1.stockEnabled).toBe(false);
    expect(copy1.stock).toBeNull();
    expect(copy1.salePrice).toBeNull();
    expect(copy1.price).toBe(250);
    // 服务类恒限购 1 件;副本继承发货处理器(handler_key)⇒ 副本不再命中不了注册表
    expect(copy1.maxPerUser).toBe(1);
    expect(copy1.handlerKey).toBe("char-change-race");

    const second = await duplicateProduct(source.id, DEL_ACTOR);
    const copy2 = await prisma.product.findUniqueOrThrow({ where: { id: second.id } });
    expect(copy2.sku).toBe(`${sourceSku}-copy-2`);
    expect(copy2.slug).toBe(`${SLUG_PREFIX}dup-src-copy-2`);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: DEL_ACTOR, action: AUDIT_ACTION.PRODUCT_DUPLICATED },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({
      sourceId: source.id.toString(),
      targetId: second.id.toString(),
    });

    // 物品类:itemsend_{id} 唯一映射契约禁止复制
    const item = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}gamecopy` }),
    );
    await expect(errCode(duplicateProduct(item.id, DEL_ACTOR))).resolves.toBe(
      "DUPLICATE_UNSUPPORTED",
    );
    await expect(errCode(duplicateProduct(9_999_999n, DEL_ACTOR))).resolves.toBe("NOT_FOUND");
  });

  it("saveProduct 透传 maxPerUser(null=不限购)", async () => {
    const entry = allocEntry();
    const { id } = await saveProduct(
      itemInput(entry, {
        slug: `${SLUG_PREFIX}maxper`,
        maxPerUser: 3,
      }),
    );
    const saved = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { maxPerUser: true },
    });
    expect(saved.maxPerUser).toBe(3);

    await saveProduct(
      itemInput(entry, {
        id,
        slug: `${SLUG_PREFIX}maxper`,
        maxPerUser: null,
      }),
    );
    const cleared = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { maxPerUser: true },
    });
    expect(cleared.maxPerUser).toBeNull();
  });
});

describe("商品图片与详情 Markdown(2026-10-26 WP 对齐)", () => {
  it("saveProduct 落库 images(有序数组,首图=主图)与 detailMd;后台列表暴露 image", async () => {
    await saveProduct(
      itemInput(allocEntry(), {
        slug: `${SLUG_PREFIX}img`,
        images: ["https://cdn.example.com/a.png", "/images/b.png"],
        detailMd: "## 详情\n\n- 要点一",
      }),
    );
    const adminItem = await prisma.product.findUniqueOrThrow({
      where: { slug: `${SLUG_PREFIX}img` },
      select: { id: true },
    });
    const listed = await listAdminProducts({});
    const hit = listed.items.find((i) => i.id === adminItem.id.toString());
    expect(hit?.image).toBe("https://cdn.example.com/a.png");
  });

  it("前台列表 image=首图;详情暴露 images+detailMd;空 images 归一 []", async () => {
    const result = await listProducts({ categorySlug: CATEGORY_SLUG });
    const imgHit = result.items.find((i) => i.slug === `${SLUG_PREFIX}img`);
    expect(imgHit?.image).toBe("https://cdn.example.com/a.png");

    const detail = await getProductDetail(`${SLUG_PREFIX}img`);
    expect(detail?.images).toEqual(["https://cdn.example.com/a.png", "/images/b.png"]);
    expect(detail?.detailMd).toBe("## 详情\n\n- 要点一");

    const plain = await getProductDetail(`${SLUG_PREFIX}svc`);
    expect(plain?.images).toEqual([]);
    expect(plain?.detailMd).toBeNull();
  });

  it("normalizeProductImages:非数组/混入非串/空白项归一", async () => {
    const { normalizeProductImages } = await import("@/server/services/catalog/products");
    expect(normalizeProductImages("not-array")).toEqual([]);
    expect(normalizeProductImages([1, "  /a.png  ", "", null])).toEqual(["/a.png"]);
  });
});

describe("商品列表快速编辑 updateProductQuickEdit(2026-11-03)", () => {
  it("部分字段更新:改价+精选生效,sku/slug/name 不被触碰;审计只记字段名", async () => {
    const entry = allocEntry();
    const saved = await saveProduct(
      itemInput(entry, { slug: `${SLUG_PREFIX}qe`, featured: false }),
    );
    await updateProductQuickEdit(saved.id, { price: 66, featured: true }, DEL_ACTOR);

    const row = await prisma.product.findUniqueOrThrow({
      where: { id: saved.id },
      select: { price: true, featured: true, sku: true, slug: true, name: true },
    });
    expect(row.price).toBe(66);
    expect(row.featured).toBe(true);
    expect(row.sku).toBe(`itemsend_${entry}`);
    expect(row.slug).toBe(`${SLUG_PREFIX}qe`);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.PRODUCT_QUICK_EDITED, actorUserId: DEL_ACTOR },
      orderBy: { id: "desc" },
    });
    expect((audit.payloadJson as { fields: string[] }).fields.sort()).toEqual([
      "featured",
      "price",
    ]);
  });

  it("促销价校验按合并现值:单改 salePrice≥现价拒绝;同时改价则按新价判定放行", async () => {
    const saved = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}qe2` }),
    );
    expect(
      await errCode(updateProductQuickEdit(saved.id, { salePrice: 100 }, DEL_ACTOR)),
    ).toBe("SALE_PRICE_INVALID");
    await updateProductQuickEdit(
      saved.id,
      { price: 200, salePrice: 150 },
      DEL_ACTOR,
    );
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: saved.id },
      select: { price: true, salePrice: true },
    });
    expect(row.price).toBe(200);
    expect(row.salePrice).toBe(150);
  });

  it("服务类禁库存字段 STOCK_NOT_APPLICABLE;物品类 stockEnabled=false 置 stock=null", async () => {
    const svc = await saveProduct(
      serviceInput(serviceKey(), { slug: `${SLUG_PREFIX}qe3` }),
    );
    expect(
      await errCode(updateProductQuickEdit(svc.id, { stock: 5 }, DEL_ACTOR)),
    ).toBe("STOCK_NOT_APPLICABLE");

    const item = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}qe4`, stockEnabled: true, stock: 3 }),
    );
    await updateProductQuickEdit(item.id, { stockEnabled: false }, DEL_ACTOR);
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: item.id },
      select: { stockEnabled: true, stock: true },
    });
    expect(row.stockEnabled).toBe(false);
    expect(row.stock).toBeNull();
  });

  it("状态/显隐/清促销一次提交;不存在 id → NOT_FOUND", async () => {
    const saved = await saveProduct(
      itemInput(allocEntry(), { slug: `${SLUG_PREFIX}qe5`, salePrice: 50 }),
    );
    await updateProductQuickEdit(
      saved.id,
      { status: "draft", listed: false, salePrice: null },
      DEL_ACTOR,
    );
    const row = await prisma.product.findUniqueOrThrow({
      where: { id: saved.id },
      select: { status: true, listed: true, salePrice: true },
    });
    expect(row.status).toBe("draft");
    expect(row.listed).toBe(false);
    expect(row.salePrice).toBeNull();

    expect(
      await errCode(updateProductQuickEdit(987654321n, { price: 1 }, DEL_ACTOR)),
    ).toBe("NOT_FOUND");
  });
});

describe("商品编辑保留促销窗口与精选(issue #72 回归,2026-11-05)", () => {
  it("全量表单仅改名:saleStart/saleEnd/featured 读回装入后保持不变;显式清空仍生效", async () => {
    const saleStart = new Date("2026-11-01T00:00:00Z");
    const saleEnd = new Date("2026-12-01T00:00:00Z");
    const entry = allocEntry();
    const { id } = await saveProduct(
      itemInput(entry, {
        slug: `${SLUG_PREFIX}keep`,
        salePrice: 80,
        saleStart,
        saleEnd,
        featured: true,
      }),
    );

    // 编辑页经 getAdminProduct DTO 读回真实三值(issue #78 串测:ISO 串可往返)
    const loaded = await getAdminProduct(id);
    expect(loaded?.saleStart).toBe(saleStart.toISOString());
    expect(loaded?.saleEnd).toBe(saleEnd.toISOString());
    expect(loaded?.featured).toBe(true);

    // 模拟表单全量保存但仅改名称:三值随 DTO 装回提交 → 不被清空
    await saveProduct(
      itemInput(entry, {
        id,
        slug: `${SLUG_PREFIX}keep`,
        name: `改名商品 ${RUN}`,
        salePrice: 80,
        saleStart: new Date(loaded!.saleStart!),
        saleEnd: new Date(loaded!.saleEnd!),
        featured: loaded!.featured,
      }),
    );
    const kept = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { name: true, saleStart: true, saleEnd: true, featured: true },
    });
    expect(kept.name).toBe(`改名商品 ${RUN}`);
    expect(kept.saleStart?.toISOString()).toBe(saleStart.toISOString());
    expect(kept.saleEnd?.toISOString()).toBe(saleEnd.toISOString());
    expect(kept.featured).toBe(true);

    // 显式清空促销与精选仍生效(区分「未提交」与「显式清空」由表单装入初值保证)
    await saveProduct(
      itemInput(entry, {
        id,
        slug: `${SLUG_PREFIX}keep`,
        salePrice: null,
        saleStart: null,
        saleEnd: null,
        featured: false,
      }),
    );
    const cleared = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { salePrice: true, saleStart: true, saleEnd: true, featured: true },
    });
    expect(cleared.salePrice).toBeNull();
    expect(cleared.saleStart).toBeNull();
    expect(cleared.saleEnd).toBeNull();
    expect(cleared.featured).toBe(false);
  });

  it("getAdminProduct DTO:BigInt/日期序列化+图片归一+NOT_FOUND(issue #78)", async () => {
    const { id } = await saveProduct(
      itemInput(allocEntry(), {
        slug: `${SLUG_PREFIX}dto`,
        images: ["/a.png"],
      }),
    );
    const dto = await getAdminProduct(id);
    expect(dto?.id).toBe(id.toString());
    expect(dto?.categoryId).toBe(categoryId.toString());
    expect(dto?.categoryName).toBe(`M5P 商品 ${RUN}`);
    expect(dto?.images).toEqual(["/a.png"]);
    expect(dto?.saleStart).toBeNull();
    expect(dto?.detailMd).toBe("");
    // 页面 DTO 必须可直接 JSON 序列化(BigInt 会 throw)
    expect(() => JSON.stringify(dto)).not.toThrow();
    expect(await getAdminProduct(9_999_999n)).toBeNull();
  });
});
