import { describe, expect, it } from "vitest";
import { classifyPageUri } from "@/server/services/stats/page-titles";

/**
 * URI 标题解析的分类决策表(纯函数,不含 IO):
 * 新站路径(/post/:slug · /shop/:slug · /forum/thread/:id)、
 * 新站固定页、旧站查询串(?p=/page_id/attachment_id/cat/post_type/product/download/tag/product_cat)
 * 与「解析不了的回落 raw」六类形态各有归属。
 */

describe("classifyPageUri 分类决策表", () => {
  it("首页与空串归 home", () => {
    expect(classifyPageUri("/")).toEqual({ kind: "home" });
    expect(classifyPageUri("")).toEqual({ kind: "home" });
  });

  it("新站固定文案路径(带/不带尾斜杠等价)", () => {
    expect(classifyPageUri("/shop")).toEqual({ kind: "static", title: "积分商店" });
    expect(classifyPageUri("/shop/")).toEqual({ kind: "static", title: "积分商店" });
    expect(classifyPageUri("/forum")).toEqual({ kind: "static", title: "论坛" });
    expect(classifyPageUri("/banlist")).toEqual({ kind: "static", title: "封禁记录" });
  });

  it("新站动态页:/post/:slug · /shop/:slug · /forum/thread/:id", () => {
    expect(classifyPageUri("/post/hello-world")).toEqual({
      kind: "article",
      slug: "hello-world",
    });
    expect(classifyPageUri("/shop/frost-mace")).toEqual({
      kind: "product",
      slug: "frost-mace",
    });
    expect(classifyPageUri("/forum/thread/123")).toEqual({ kind: "thread", id: 123 });
  });

  it("动态页仅匹配单段 slug:多段路径不误归", () => {
    expect(classifyPageUri("/post/a/b").kind).toBe("raw");
    expect(classifyPageUri("/shop/a/b").kind).toBe("raw");
    expect(classifyPageUri("/forum/thread/abc").kind).toBe("raw");
  });

  it("旧站文章 ID 查询串(?p=/page_id/attachment_id)", () => {
    expect(classifyPageUri("/?p=2437")).toEqual({ kind: "wpPostId", id: 2437 });
    expect(classifyPageUri("/?page_id=2")).toEqual({ kind: "wpPostId", id: 2 });
    expect(classifyPageUri("/?attachment_id=99")).toEqual({ kind: "wpPostId", id: 99 });
  });

  it("旧站分类查询串(?cat=)", () => {
    expect(classifyPageUri("/?cat=12")).toEqual({ kind: "wpCatId", id: 12 });
  });

  it("旧站 post_type 归档页归固定文案", () => {
    expect(classifyPageUri("/?post_type=product")).toEqual({
      kind: "static",
      title: "积分商店",
    });
    expect(classifyPageUri("/?post_type=post")).toEqual({
      kind: "static",
      title: "文章列表",
    });
  });

  it("旧站 slug 型查询串(product/download/tag/product_cat)", () => {
    expect(classifyPageUri("/?product=frost-mace")).toEqual({
      kind: "wpPostSlug",
      slug: "frost-mace",
    });
    expect(classifyPageUri("/?download=x")).toEqual({ kind: "wpPostSlug", slug: "x" });
    expect(classifyPageUri("/?tag=y")).toEqual({ kind: "wpPostSlug", slug: "y" });
    expect(classifyPageUri("/?product_cat=z")).toEqual({ kind: "wpPostSlug", slug: "z" });
  });

  it("p 优先于 page_id;非数字参数不算命中", () => {
    expect(classifyPageUri("/?p=1&page_id=2")).toEqual({ kind: "wpPostId", id: 1 });
    expect(classifyPageUri("/?p=abc").kind).toBe("raw");
    expect(classifyPageUri("/?cat=x").kind).toBe("raw");
  });

  it("解析不了的形态回落 raw(未登记查询串/未知路径)", () => {
    expect(classifyPageUri("/?foo=bar")).toEqual({ kind: "raw" });
    expect(classifyPageUri("/unknown/path")).toEqual({ kind: "raw" });
    expect(classifyPageUri("/?post_type=unknown_type").kind).toBe("raw");
  });
});
