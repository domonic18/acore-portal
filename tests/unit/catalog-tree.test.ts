import { describe, expect, it } from "vitest";
import {
  ancestorIdsOf,
  buildCategoryTree,
  findNodeBySlug,
  flattenCategoryTree,
  pruneEmptyCategories,
  subtreeIdsOf,
  type CategoryRow,
} from "@/lib/catalog-tree";

/**
 * 分类树纯函数守卫(商城分面栏的数据底座):
 * 子树计数是「点父分类看到子树商品」的正确性来源,环会让计数与筛选结果不可预期。
 */

function row(
  id: string,
  name: string,
  parentId: string | null,
  ownCount: number,
  sort = 0,
): CategoryRow {
  return { id, name, slug: `s-${id}`, parentId, sort, ownCount };
}

const SAMPLE: CategoryRow[] = [
  row("1", "传家宝", null, 0, 100),
  row("2", "武器", "1", 0, 1),
  row("3", "物理系", "2", 10, 1),
  row("4", "法术系", "2", 4, 2),
  row("5", "布甲", "1", 3, 2),
  row("6", "幻化", null, 0, 200),
  row("7", "坐骑", null, 17, 300),
];

describe("buildCategoryTree", () => {
  it("父子聚合计数:父分类计数=自身+子树合计", () => {
    const tree = buildCategoryTree(SAMPLE);
    const heirloom = tree.find((n) => n.id === "1");
    expect(heirloom?.ownCount).toBe(0);
    expect(heirloom?.subtreeCount).toBe(17); // 10 + 4 + 3
    const weapon = heirloom?.children.find((n) => n.id === "2");
    expect(weapon?.subtreeCount).toBe(14);
  });

  it("自身无货但子树有货的父分类仍保留", () => {
    const tree = buildCategoryTree(SAMPLE);
    const weapon = tree[0]?.children.find((n) => n.id === "2");
    expect(weapon?.ownCount).toBe(0);
    expect(weapon?.subtreeCount).toBe(14);
  });

  it("父 id 指向不存在的行 ⇒ 按根处理(不静默丢商品)", () => {
    const tree = buildCategoryTree([row("9", "孤儿", "不存在的父", 5)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe("9");
    expect(tree[0]?.subtreeCount).toBe(5);
  });

  it("存在环 ⇒ 抛错(不给错数)", () => {
    const cyclic = [row("a", "A", "b", 1), row("b", "B", "a", 1)];
    expect(() => buildCategoryTree(cyclic)).toThrow(/环/);
  });

  it("自指(自己是自己的父)⇒ 抛错(结构自相矛盾)", () => {
    expect(() => buildCategoryTree([row("a", "A", "a", 1)])).toThrow(/环/);
  });

  it("同 sort 按名称稳定排序", () => {
    const tree = buildCategoryTree([
      row("2", "乙", null, 1, 5),
      row("1", "甲", null, 1, 5),
      row("3", "丙", null, 1, 1),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["丙", "甲", "乙"]);
  });
});

describe("flattenCategoryTree / findNodeBySlug", () => {
  it("前序平铺:父在前、子在后", () => {
    const flat = flattenCategoryTree(buildCategoryTree(SAMPLE));
    expect(flat.map((n) => n.id)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("按 slug 查节点;未知 slug 返回 null", () => {
    const tree = buildCategoryTree(SAMPLE);
    expect(findNodeBySlug(tree, "s-3")?.name).toBe("物理系");
    expect(findNodeBySlug(tree, "不存在")).toBeNull();
  });
});

describe("subtreeIdsOf / ancestorIdsOf", () => {
  it("子树 id 集合含自身与全部子孙(筛选下推 DB 用)", () => {
    const tree = buildCategoryTree(SAMPLE);
    expect(subtreeIdsOf(tree, "1")).toEqual(["1", "2", "3", "4", "5"]);
    expect(subtreeIdsOf(tree, "3")).toEqual(["3"]);
    expect(subtreeIdsOf(tree, "不存在")).toEqual([]);
  });

  it("祖先链自根向父(命中子分类时自动展开上级)", () => {
    const flat = flattenCategoryTree(buildCategoryTree(SAMPLE));
    expect(ancestorIdsOf(flat, "3")).toEqual(["1", "2"]);
    expect(ancestorIdsOf(flat, "1")).toEqual([]);
  });
});

describe("pruneEmptyCategories", () => {
  it("自身与子树都无货的分类被剪掉(点了也是空)", () => {
    const tree = buildCategoryTree(SAMPLE);
    const pruned = pruneEmptyCategories(tree);
    expect(pruned.map((n) => n.name)).toEqual(["传家宝", "坐骑"]);
    // 子树有货的中间层保留
    expect(pruned[0]?.children.map((n) => n.name)).toEqual(["武器", "布甲"]);
  });
});
