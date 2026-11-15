import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SERVICE_HANDLER_OPTIONS } from "@/constants/shop-sku";

/**
 * 商城分类导入链守卫(2026-11-15):
 * 旧站能筛、新站点子类全空,根因是 shop-import.sql 的三处缺陷 + 一处口径缺漏:
 *   S1 分类插入不去重 ⇒ WP 侧 %xx 编码 slug 经 slug-normalize 解码后重跑,
 *      按 slug 判存在失效 ⇒ 同名分类插出第二行(0 商品、sort 全 0,前台顺序随机)。
 *   S2 分类/商品↔分类的关联键用 slug ⇒ slug 会被归一改写,关联失效。
 *   S3 分类 sort 写死 0 ⇒ 前台 filesort 顺序随机。
 *   S4 商品归类取 MIN(c.id) ⇒ 多分类商品被压到 id 最小的父分类,子类恒为 0 件。
 *   S5 服务类上架白名单缺 name-unlock(幻化 transmog-item_% 按用户裁决保持草稿,不得上架)。
 * 另:reconcile.mjs 必须留有分类相关断言,防「静默丢分类」再次通过迁移链。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHOP_SQL = path.join(ROOT, "scripts/migrate/shop-import.sql");
const RECONCILE = path.join(ROOT, "scripts/migrate/reconcile.mjs");

const sql = readFileSync(SHOP_SQL, "utf8");
const reconcile = readFileSync(RECONCILE, "utf8");

/** 去掉注释行:注释里可以写「旧口径是 MIN(c.id)」这类说明,不该被守卫当成残留代码 */
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

/** 取 SQL 里全部 `pm.sku IN (...)` 白名单里的键 */
function skuWhitelist(source: string): string[] {
  const keys: string[] = [];
  for (const m of source.matchAll(/pm\.sku IN \(([^)]*)\)/g)) {
    for (const k of (m[1] ?? "").matchAll(/'([^']+)'/g)) keys.push(k[1] ?? "");
  }
  return [...new Set(keys)].sort();
}

describe("商城分类导入:去重与关联键", () => {
  it("S1 分类按**分类名**去重(同名取 term_id 最小的一行)", () => {
    expect(sql).toMatch(/ROW_NUMBER\(\) OVER \(PARTITION BY t\.name ORDER BY tt\.term_id\)/);
    // 插入前按分类名判存在
    expect(sql).toMatch(
      /LEFT JOIN product_category pc ON pc\.name = c\.name COLLATE utf8mb4_unicode_ci/,
    );
  });

  it("S1 旧的「按 slug 判存在 + 写死 sort」形态已消失", () => {
    expect(code).not.toMatch(/SELECT t\.name, t\.slug, 0/);
    expect(code).not.toMatch(/INSERT INTO product_category \(name, slug, sort\)\s*\nSELECT t\./);
  });

  it("S2 分类与商品的关联键不得用 slug(slug 会被 slug-normalize 改写)", () => {
    expect(code).not.toMatch(/c\.slug = t\.slug/);
    expect(code).not.toMatch(/pc\.slug = /);
    // 父分类回填也走分类名
    expect(sql).toMatch(/ppc\.name = ptm\.name COLLATE utf8mb4_unicode_ci/);
  });

  it("S3 分类 sort 是「全局前序序」而非全 0", () => {
    expect(sql).toContain("tmp_shop_cat_sort");
    expect(sql).toMatch(/WITH RECURSIVE/);
    expect(sql).toMatch(/sibling_rank \* 100 AS sort/);
    expect(sql).toMatch(/p\.sort \* 100 \+ c\.sibling_rank/);
    expect(sql).toMatch(/SELECT c\.name, c\.slug, COALESCE\(s\.sort, 0\)/);
  });

  it("S4 商品归到**最深** WP product_cat term,不再取 MIN(c.id)", () => {
    expect(code).not.toMatch(/MIN\(c\.id\)/);
    expect(sql).toContain("tmp_shop_cat_depth");
    expect(sql).toMatch(/ORDER BY d\.depth DESC, tt\.term_id ASC, pc\.id ASC/);
  });

  it("S4 存量商品归属有幂等自愈(重跑把老口径压错的商品纠正回来)", () => {
    expect(sql).toMatch(
      /UPDATE product p\s*\n\s*JOIN tmp_shop_product_cat leaf ON leaf\.legacy_post_id = p\.legacy_wp_product_id\s*\n\s*SET p\.category_id = leaf\.category_id/,
    );
  });
});

describe("商城分类导入:上架白名单", () => {
  it("S5 服务类白名单与服务处理器注册表一致", () => {
    expect(skuWhitelist(sql)).toEqual(
      SERVICE_HANDLER_OPTIONS.map((o) => o.key).sort(),
    );
  });

  it("S5 幻化(transmog-item_%)按用户裁决保持草稿,不得进上架白名单", () => {
    expect(sql).not.toMatch(/pm\.sku IN \([^)]*transmog/);
    expect(sql).not.toMatch(/'transmog-item_%'/);
  });

  it("S5 物品类(itemsend_%)仍可上架", () => {
    expect(sql).toMatch(/pm\.sku LIKE 'itemsend\\\\_%'/);
  });
});

describe("迁移对账:分类断言", () => {
  const ids = ["category-uniq", "category-coverage", "category-parent-integrity", "category-assignment"];

  it.each(ids)("reconcile.mjs 含 %s 断言", (id) => {
    expect(reconcile).toContain(`id: "${id}"`);
  });

  it("商品分类归属断言按 WP 最深 term 口径比对(与 shop-import 同源)", () => {
    expect(reconcile).toMatch(/ORDER BY d\.depth DESC, tt\.term_id ASC, pc\.id ASC/);
  });
});
