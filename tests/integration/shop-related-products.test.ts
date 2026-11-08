import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS, PRODUCT_TYPE } from "@/constants/shop";
import { getProductDetail, listRelatedProducts } from "@/server/services/catalog/products";

/**
 * 详情页推荐位(#158):同分类优先、不含自己、只取 published+listed。
 * 夹具直接写库(不走 saveProduct:推荐位只读商品字段,与保存校验无关)。
 */
const RUN = Date.now().toString(36);
const SLUG_PREFIX = `relp-${RUN}-`;
const CAT_A = `relp-cata-${RUN}`;
const CAT_B = `relp-catb-${RUN}`;

let catA = 0n;
let catB = 0n;
let currentId = 0n;
let sameNewestId = 0n;
let sameOlderId = 0n;
let otherCatId = 0n;
let draftId = 0n;
let unlistedId = 0n;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: { in: [CAT_A, CAT_B] } } });

  catA = (
    await prisma.productCategory.create({
      data: { name: `推荐位分类A ${RUN}`, slug: CAT_A, sort: 97 },
      select: { id: true },
    })
  ).id;
  catB = (
    await prisma.productCategory.create({
      data: { name: `推荐位分类B ${RUN}`, slug: CAT_B, sort: 97 },
      select: { id: true },
    })
  ).id;

  const mk = async (opts: {
    key: string;
    categoryId: bigint;
    status?: (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];
    listed?: boolean;
    createdAt?: Date;
  }) => {
    const row = await prisma.product.create({
      data: {
        sku: `relp-${RUN}-${opts.key}`,
        slug: `${SLUG_PREFIX}${opts.key}`,
        name: `推荐位商品 ${opts.key}`,
        description: "推荐位夹具",
        type: PRODUCT_TYPE.GAME_ITEM,
        status: opts.status ?? PRODUCT_STATUS.PUBLISHED,
        listed: opts.listed ?? true,
        price: 100,
        categoryId: opts.categoryId,
        images: [],
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
      select: { id: true },
    });
    return row.id;
  };

  const base = Date.now();
  currentId = await mk({ key: "current", categoryId: catA });
  sameNewestId = await mk({ key: "same-new", categoryId: catA, createdAt: new Date(base - 1000) });
  sameOlderId = await mk({ key: "same-old", categoryId: catA, createdAt: new Date(base - 900000) });
  otherCatId = await mk({ key: "other", categoryId: catB, createdAt: new Date(base - 500) });
  draftId = await mk({ key: "draft", categoryId: catA, status: PRODUCT_STATUS.DRAFT });
  unlistedId = await mk({ key: "unlisted", categoryId: catA, listed: false });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: SLUG_PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: { in: [CAT_A, CAT_B] } } });
  await prisma.$disconnect();
});

describe("详情页推荐位(#158)", () => {
  it("同分类优先、排除自己、只取 published+listed", async () => {
    const items = await listRelatedProducts({
      categoryId: catA.toString(),
      excludeId: currentId.toString(),
    });
    const ids = items.map((p) => p.id);
    expect(ids).not.toContain(currentId.toString());
    expect(ids).not.toContain(draftId.toString());
    expect(ids).not.toContain(unlistedId.toString());
    // 同分类商品排在其他分类之前
    expect(ids.indexOf(sameNewestId.toString())).toBeLessThan(
      ids.indexOf(otherCatId.toString()),
    );
    // 同分类内部按上架时间倒序
    expect(ids.indexOf(sameNewestId.toString())).toBeLessThan(
      ids.indexOf(sameOlderId.toString()),
    );
  });

  it("条数受 limit 约束", async () => {
    const items = await listRelatedProducts({
      categoryId: catA.toString(),
      excludeId: currentId.toString(),
      limit: 1,
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(sameNewestId.toString());
  });

  it("详情对象带 categoryId(推荐位入参)", async () => {
    const detail = await getProductDetail(`${SLUG_PREFIX}current`);
    expect(detail?.categoryId).toBe(catA.toString());
  });
});
