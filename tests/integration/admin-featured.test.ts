import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION } from "@/constants/audit";
import {
  FeaturedAdminError,
  addFeaturedProduct,
  listFeaturedCandidates,
  listFeaturedForAdmin,
  removeFeaturedProduct,
  reorderFeaturedProducts,
} from "@/server/services/home/featured";

/**
 * 首页精选商品管理集成:加入追加末位/移出重写连续序/重排须全集一致(规则 21)。
 * dev 库可能有其他精选商品:断言全部用相对序(列表切片/大小比较),不锚绝对值。
 */
const RUN = Date.now().toString(36);
const PREFIX = `e2efeat-${RUN}`;
const ACTOR = 9_950_043_001n;
const ids: bigint[] = [];

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof FeaturedAdminError) return err.code;
    throw err;
  }
  throw new Error("expected FeaturedAdminError");
}

let catId: bigint;
const mkProduct = (slug: string, opts: { status?: "draft" | "published" } = {}) =>
  prisma.product
    .create({
      data: {
        type: "game_item",
        sku: `${PREFIX}-${slug}`,
        slug: `${PREFIX}-${slug}`,
        name: `精选夹具 ${slug}`,
        description: "",
        categoryId: catId,
        price: 100,
        status: opts.status ?? "published",
      },
      select: { id: true },
    })
    .then((r) => {
      ids.push(r.id);
      return r.id;
    });

const mineInOrder = async () =>
  (await listFeaturedForAdmin()).filter((p) => p.slug.startsWith(`${PREFIX}-`));

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const stale = await prisma.product.findMany({
    where: { slug: { startsWith: PREFIX } },
    select: { id: true },
  });
  await prisma.product.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  const cat = await prisma.productCategory.create({
    data: { name: `精选夹具分类 ${RUN}`, slug: `${PREFIX}-cat` },
    select: { id: true },
  });
  catId = cat.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.productCategory.deleteMany({ where: { slug: `${PREFIX}-cat` } });
  await prisma.$disconnect();
});

describe("首页精选商品管理", () => {
  it("加入追加末位;候选=已上架未精选;非上架拒;不存在 NOT_FOUND", async () => {
    const p1 = await mkProduct("a");
    const p2 = await mkProduct("b");
    const draft = await mkProduct("d", { status: "draft" });
    await addFeaturedProduct(p1, ACTOR);
    await addFeaturedProduct(p2, ACTOR);
    const mine = await mineInOrder();
    expect(mine.map((p) => p.name)).toEqual(["精选夹具 a", "精选夹具 b"]);
    // 末位追加:b 后于 a
    const [rowA, rowB] = mine;
    expect(rowB!.featuredSort).toBeGreaterThan(rowA!.featuredSort);

    // 幂等:重复加入不再追加
    await addFeaturedProduct(p1, ACTOR);
    expect((await mineInOrder()).length).toBe(2);

    const candidates = await listFeaturedCandidates();
    expect(candidates.some((c) => c.id === p1.toString())).toBe(false);
    expect(candidates.some((c) => c.id === draft.toString())).toBe(false);

    expect(await errCode(addFeaturedProduct(draft, ACTOR))).toBe("NOT_PUBLISHED");
    expect(await errCode(addFeaturedProduct(9_999_999n, ACTOR))).toBe("NOT_FOUND");
  });

  it("重排须与精选全集一致:子集拒(SET_MISMATCH);全集重写成功", async () => {
    // dev 库精选全集可能含夹具外商品:全集重排须带上(只动相对位置)
    const p3 = await mkProduct("c");
    await addFeaturedProduct(p3, ACTOR);

    expect(await errCode(reorderFeaturedProducts([p3], ACTOR))).toBe("SET_MISMATCH");

    const current = await prisma.product.findMany({
      where: { featured: true },
      orderBy: [{ featuredSort: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    // 把 c 提到最前,a/b 保持原相对序(加入顺序 a→b)
    const reordered = [p3, ...current.map((r) => r.id).filter((id) => id !== p3)];
    await reorderFeaturedProducts(reordered, ACTOR);
    const mine = await mineInOrder();
    expect(mine.map((p) => p.name)).toEqual([
      "精选夹具 c",
      "精选夹具 a",
      "精选夹具 b",
    ]);
    // 全表按序连续(0..n-1)
    const all = await listFeaturedForAdmin();
    expect(all.map((p) => p.featuredSort)).toEqual(all.map((_, i) => i));

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: ACTOR, action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED },
      orderBy: { id: "desc" },
    });
    expect(Array.isArray((audit.payloadJson as { orderedIds?: string[] }).orderedIds)).toBe(true);
  });

  it("移出精选:剩余重写连续序;重复移出幂等", async () => {
    const before = await mineInOrder();
    const victim = before.find((p) => p.name === "精选夹具 b")!;

    await removeFeaturedProduct(BigInt(victim.id), ACTOR);
    const after = await mineInOrder();
    expect(after.map((p) => p.name)).toEqual(["精选夹具 c", "精选夹具 a"]);
    // 剩余全集(含 dev 库存量精选)重写为连续序
    const all = await listFeaturedForAdmin();
    expect(all.map((p) => p.featuredSort)).toEqual(all.map((_, i) => i));

    const audits = await prisma.auditLog.findMany({
      where: { actorUserId: ACTOR, action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED },
    });
    expect(
      audits.some(
        (a) => (a.payloadJson as { featured?: boolean }).featured === false,
      ),
    ).toBe(true);

    await removeFeaturedProduct(BigInt(victim.id), ACTOR); // 幂等,无新审计
    const count = await prisma.auditLog.count({
      where: { actorUserId: ACTOR, action: AUDIT_ACTION.PRODUCT_FEATURED_SAVED },
    });
    expect(count).toBe(audits.length);
  });
});
