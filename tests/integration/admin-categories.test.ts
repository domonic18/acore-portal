import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  CategoryAdminError,
  listAdminCategories,
  listAdminCategoryOptions,
  saveCategory,
} from "@/server/services/catalog/admin";

/**
 * 后台分类树集成(FR-126 父子聚合口径):
 * 建树/改挂上级、环检测(自身/自己的下级)、上级不存在、slug 冲突,
 * 列表返回树(自身数与子树合计分开),下拉项按树序扁平化。
 */
const RUN = Date.now().toString(36);
const PREFIX = `cat-admin-${RUN}`;

let parentId = 0n;
let childId = 0n;
let grandChildId = 0n;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const parent = await saveCategory({
    name: `父 ${RUN}`,
    slug: `${PREFIX}-parent`,
    sort: 1,
  });
  parentId = parent.id;
  const child = await saveCategory({
    name: `子 ${RUN}`,
    slug: `${PREFIX}-child`,
    sort: 2,
    parentId,
  });
  childId = child.id;
  const grandChild = await saveCategory({
    name: `孙 ${RUN}`,
    slug: `${PREFIX}-grand`,
    sort: 3,
    parentId: childId,
  });
  grandChildId = grandChild.id;

  // 挂一个商品到孙子节点,验证子树合计自底向上聚合(父 1 / 子 1 / 孙 1)
  await prisma.product.create({
    data: {
      sku: `cat-admin-sku-${RUN}`,
      name: `分类树测试商品 ${RUN}`,
      slug: `${PREFIX}-product`,
      description: "分类树计数用",
      type: "service",
      handlerKey: `cat-admin-handler-${RUN}`,
      categoryId: grandChildId,
      status: "draft",
      price: 100,
    },
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIX } },
  });
  await prisma.productCategory.deleteMany({
    where: { slug: { startsWith: PREFIX } },
  });
  await prisma.$disconnect();
});

describe("后台分类树", () => {
  it("新建分类带上级,列表按树返回并区分自身数与子树合计", async () => {
    const tree = await listAdminCategories();
    const parent = tree.find((n) => n.id === parentId.toString());
    expect(parent).toBeDefined();
    expect(parent?.children.map((c) => c.id)).toEqual([childId.toString()]);
    const child = parent?.children[0];
    expect(child?.children.map((c) => c.id)).toEqual([grandChildId.toString()]);
    // 商品挂在孙子节点:自身数只有孙子是 1,父/子自身为 0,子树合计自底向上都是 1
    const grand = child?.children[0];
    expect(parent?.ownCount).toBe(0);
    expect(parent?.subtreeCount).toBe(1);
    expect(child?.ownCount).toBe(0);
    expect(child?.subtreeCount).toBe(1);
    expect(grand?.ownCount).toBe(1);
    expect(grand?.subtreeCount).toBe(1);
  });

  it("下拉项按树序扁平化并带层级深度", async () => {
    const options = await listAdminCategoryOptions();
    const idx = options.findIndex((o) => o.id === parentId.toString());
    const childIdx = options.findIndex((o) => o.id === childId.toString());
    const grandIdx = options.findIndex((o) => o.id === grandChildId.toString());
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(childIdx);
    expect(childIdx).toBeLessThan(grandIdx);
    expect(options[idx]?.depth).toBe(0);
    expect(options[childIdx]?.depth).toBe(1);
    expect(options[grandIdx]?.depth).toBe(2);
    // 下拉计数是「自身商品数」(筛选按 category_id 精确匹配)
    expect(options[idx]?.productCount).toBe(0);
    expect(options[grandIdx]?.productCount).toBe(1);
  });

  it("上级不能是自己", async () => {
    await expect(
      saveCategory({
        id: parentId,
        name: `父 ${RUN}`,
        slug: `${PREFIX}-parent`,
        sort: 1,
        parentId,
      }),
    ).rejects.toMatchObject({ code: "CYCLE" });
  });

  it("上级不能是自己的下级(改挂会成环)", async () => {
    await expect(
      saveCategory({
        id: parentId,
        name: `父 ${RUN}`,
        slug: `${PREFIX}-parent`,
        sort: 1,
        parentId: grandChildId,
      }),
    ).rejects.toMatchObject({ code: "CYCLE" });
  });

  it("上级不存在报 INVALID_PARENT", async () => {
    await expect(
      saveCategory({
        name: `孤儿 ${RUN}`,
        slug: `${PREFIX}-orphan`,
        sort: 9,
        parentId: 999_999_999n,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PARENT" });
  });

  it("slug 冲突报 DUPLICATE", async () => {
    await expect(
      saveCategory({
        name: `子 ${RUN}`,
        slug: `${PREFIX}-child`,
        sort: 2,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("编辑分类可改挂上级,也可清空上级回到顶级", async () => {
    const moved = await saveCategory({
      id: grandChildId,
      name: `孙 ${RUN}`,
      slug: `${PREFIX}-grand`,
      sort: 3,
      parentId,
    });
    expect(moved.id).toBe(grandChildId);

    const tree = await listAdminCategories();
    const parent = tree.find((n) => n.id === parentId.toString());
    expect(parent?.children.map((c) => c.id).sort()).toEqual(
      [childId.toString(), grandChildId.toString()].sort(),
    );

    await saveCategory({
      id: grandChildId,
      name: `孙 ${RUN}`,
      slug: `${PREFIX}-grand`,
      sort: 3,
      parentId: null,
    });
    const after = await listAdminCategories();
    expect(
      after.some((n) => n.id === grandChildId.toString()),
    ).toBe(true);
    expect(
      after.find((n) => n.id === parentId.toString())?.children.map((c) => c.id),
    ).toEqual([childId.toString()]);
  });

  it("错误类型是可辨识的 CategoryAdminError", async () => {
    const err = await saveCategory({
      name: `子 ${RUN}`,
      slug: `${PREFIX}-child`,
      sort: 2,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CategoryAdminError);
    expect((err as CategoryAdminError).code).toBe("DUPLICATE");
  });
});
