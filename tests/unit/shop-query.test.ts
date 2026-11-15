import { describe, expect, it } from "vitest";
import { PRODUCT_SORT } from "@/constants/shop";
import { buildShopHref, isPlainShopQuery, parseShopQuery } from "@/lib/shop-query";

/**
 * 商城 URL 查询态守卫:筛选/排序/分页全靠 URL 承载,
 * 参数解析与链接拼装任一处漂移都会让「可分享/可回退」失效。
 */

describe("parseShopQuery", () => {
  it("空参数 ⇒ 初始态(默认最新上架、第 1 页)", () => {
    const q = parseShopQuery({});
    expect(q.categorySlugs).toEqual([]);
    expect(q.keyword).toBe("");
    expect(q.minPrice).toBeNull();
    expect(q.maxPrice).toBeNull();
    expect(q.sort).toBe(PRODUCT_SORT.NEWEST);
    expect(q.page).toBe(1);
  });

  it("分类多选:逗号分隔;重复项去重", () => {
    const q = parseShopQuery({ category: "a,b,a" });
    expect(q.categorySlugs).toEqual(["a", "b"]);
  });

  it("单值分类(旧书签 ?category=<slug>)兼容", () => {
    expect(parseShopQuery({ category: "heirloom" }).categorySlugs).toEqual(["heirloom"]);
  });

  it("价格只认非负整数,其余一律忽略", () => {
    expect(parseShopQuery({ min: "100", max: "500" })).toMatchObject({
      minPrice: 100,
      maxPrice: 500,
    });
    expect(parseShopQuery({ min: "-5" }).minPrice).toBeNull();
    expect(parseShopQuery({ min: "abc" }).minPrice).toBeNull();
    expect(parseShopQuery({ max: "1.5" }).maxPrice).toBeNull();
    expect(parseShopQuery({ min: "0" }).minPrice).toBe(0);
  });

  it("下限高于上限时交换(用户手输反了不该看到空结果)", () => {
    const q = parseShopQuery({ min: "500", max: "100" });
    expect(q.minPrice).toBe(100);
    expect(q.maxPrice).toBe(500);
  });

  it("未知排序值回落默认;数组参数取首值", () => {
    expect(parseShopQuery({ sort: "price_asc" }).sort).toBe(PRODUCT_SORT.PRICE_ASC);
    expect(parseShopQuery({ sort: "乱写" }).sort).toBe(PRODUCT_SORT.NEWEST);
    expect(parseShopQuery({ sort: ["price_desc", "price_asc"] }).sort).toBe(
      PRODUCT_SORT.PRICE_DESC,
    );
  });

  it("页码非法/非正 ⇒ 回到第 1 页", () => {
    expect(parseShopQuery({ page: "3" }).page).toBe(3);
    expect(parseShopQuery({ page: "0" }).page).toBe(1);
    expect(parseShopQuery({ page: "-2" }).page).toBe(1);
    expect(parseShopQuery({ page: "abc" }).page).toBe(1);
  });
});

describe("buildShopHref", () => {
  const base = parseShopQuery({});

  it("无筛选 ⇒ 干净路径 /shop", () => {
    expect(buildShopHref(base)).toBe("/shop");
  });

  it("默认排序与第 1 页不落 URL", () => {
    expect(buildShopHref(base, { sort: PRODUCT_SORT.NEWEST, page: 1 })).toBe("/shop");
    expect(buildShopHref(base, { sort: PRODUCT_SORT.PRICE_ASC })).toBe("/shop?sort=price_asc");
    expect(buildShopHref(base, { page: 2 })).toBe("/shop?page=2");
  });

  it("多分类合并成一个逗号分隔参数", () => {
    const href = buildShopHref(base, { categorySlugs: ["a", "b"], page: 1 });
    expect(href).toBe("/shop?category=a%2Cb");
  });

  it("写 null 表示清掉该筛选;不写表示沿用原值", () => {
    const q = parseShopQuery({ category: "a", q: "剑", min: "10", max: "99" });
    expect(buildShopHref(q, { keyword: null })).toBe("/shop?category=a&min=10&max=99");
    expect(buildShopHref(q, { categorySlugs: [] })).toBe("/shop?q=%E5%89%91&min=10&max=99");
    expect(buildShopHref(q, {})).toBe("/shop?category=a&q=%E5%89%91&min=10&max=99");
  });

  it("价格为 0 时也要落 min=0(下限 0 与「不限」不同)", () => {
    expect(buildShopHref(base, { minPrice: 0 })).toBe("/shop?min=0");
  });
});

describe("isPlainShopQuery", () => {
  it("无任何筛选 ⇒ 初始态(空态文案据此分三态)", () => {
    expect(isPlainShopQuery(parseShopQuery({}))).toBe(true);
    expect(isPlainShopQuery(parseShopQuery({ category: "a" }))).toBe(false);
    expect(isPlainShopQuery(parseShopQuery({ q: "剑" }))).toBe(false);
    expect(isPlainShopQuery(parseShopQuery({ min: "0" }))).toBe(false);
  });
});
