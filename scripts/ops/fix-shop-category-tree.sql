-- 商城商品分类树修复(2026-11-15)
--
-- 背景(三个独立成因,均在生产库实勘确认,互不替代):
--   A. 多分类商品被压成单分类 —— scripts/migrate/shop-import.sql 用
--      `MIN(c.id)` 给商品取分类,一件挂多个 WP 分类的商品只留 id 最小的那个,
--      而父分类 id 往往更小。生产实测:14 件武器各挂「传家宝+武器+物理系/法术系」,
--      结果全落在「武器」(id 2 < 物理系 id 8),「物理系/法术系」两个子类恒为 0。
--      ⇒ 这就是旧站能筛、新站点子类全是空的原因。
--   B. product_category 有 9 行重复分类 —— shop-import.sql 插分类时不去重,
--      WP 侧 5 个中文分类的 slug 是 %xx 百分号编码(如 %e7%89%a9%e7%90%86%e7%b3%bb),
--      于是同名分类被插了两遍,带 %xx 的那行 0 商品;分类排序又全是 0
--      ⇒ 导航顺序随机,用户点到的第一个同名项恰好是空的那行。
--   C. 幻化 24 件在 WP 存量里本来就是 draft(99 件里 61 published + 38 draft),
--      旧站同样筛不出来。用户裁决:保持草稿不上架。
--      ⇒ 正确行为是「计数 0 即不出现」,而不是「显示出来再报空」。
--
-- 口径:
--   * 商品归属取**最深**的 WP product_cat term(同深取 term_id 最小 ⇒ 确定性);
--     父分类不再直接挂商品,前台按父子聚合展示(单分类 + 父子聚合)。
--   * **只改归属,不改 status / listed** ⇒ 幻化仍是草稿,商品可见性零变化。
--   * 分类 slug 一律不动 ⇒ 旧书签 ?category=xxx 继续可用。
--   * 分类树按 WP 的 parent 关系重建,sort 改成「同父内序号」的全局前序序
--     (sort = parent.sort * 100 + 同父序号,限深 ≤ 4,Int 范围内不溢出)。
--   * 幂等:重跑零变更(删过的行已不存在;归属已是目标值;sort 已是目标值)。
--
-- 前置:
--   1) wp_legacy 与业务库同实例(生产 WP dump 已导入同实例)
--   2) 先备份业务库 product / product_category 两表
-- 执行:
--   mysql -h <host> -u <user> -p <业务库名> < scripts/ops/fix-shop-category-tree.sql
--   默认 @apply_fix = 0 ⇒ ① 段只读预检(仅建空的备份表,不动业务数据);
--   核对输出后把文件开头 @apply_fix 改成 1 重跑(② 段快照 + ③ 段修复 + ④ 段校验)。
--   不写死库名:由命令行 -p <业务库名> 指定(生产库名与 dev 不同)。
--   回滚:scripts/ops/fix-shop-category-tree.rollback.sql(从 ops_shop_category_bak 反向还原)

-- 开关:0 = 只读预检;1 = 执行修复
SET @apply_fix := 0;

-- ============================================================
-- ① 修正前核对(只读;@apply_fix=0 时本脚本只输出这些)
-- ============================================================

-- ①-1 分类明细与商品计数
SELECT '①-1 分类明细' AS `段`, pc.id, pc.name, pc.slug, pc.parent_id, pc.sort,
       COALESCE(SUM(p.status = 'published' AND p.listed = 1), 0) AS `已上架`,
       COALESCE(SUM(p.status = 'draft' AND p.listed = 1), 0)       AS `草稿`,
       COUNT(p.id) AS `合计`
  FROM product_category pc
  LEFT JOIN product p ON p.category_id = pc.id
 GROUP BY pc.id, pc.name, pc.slug, pc.parent_id, pc.sort
 ORDER BY pc.id;

-- ①-2 同名重复分类(应为空;现存 9 行,全是 %xx 编码且 0 商品)
SELECT '①-2 同名重复分类' AS `段`, name, COUNT(*) AS `行数`,
       GROUP_CONCAT(id ORDER BY id) AS `id 列表`,
       GROUP_CONCAT(slug ORDER BY id) AS `slug 列表`
  FROM product_category
 GROUP BY name
HAVING COUNT(*) > 1;

-- ①-3 slug 仍是百分号编码的行(应为空)
SELECT '①-3 未解码 slug' AS `段`, id, name, slug
  FROM product_category
 WHERE slug LIKE '%\%%';

-- ①-4 归属与「最深 WP term」不一致的商品(这就是要改的行)
--     生产预期:14 行(全部是武器,应拆成 物理系 10 / 法术系 4)
DROP TEMPORARY TABLE IF EXISTS tmp_fix_depth;
CREATE TEMPORARY TABLE tmp_fix_depth (
  term_id BIGINT NOT NULL PRIMARY KEY,
  depth INT NOT NULL
);
INSERT INTO tmp_fix_depth (term_id, depth)
WITH RECURSIVE td AS (
  SELECT tt.term_id AS term_id, 0 AS depth
    FROM wp_legacy.wp_term_taxonomy tt
   WHERE tt.taxonomy = 'product_cat' AND tt.parent = 0
  UNION ALL
  SELECT c.term_id, p.depth + 1
    FROM wp_legacy.wp_term_taxonomy c
    JOIN td p ON c.parent = p.term_id
   WHERE c.taxonomy = 'product_cat'
)
SELECT term_id, depth FROM td;

-- 名称 → 规范分类行(同名取「有商品的那行」,并列取 id 最小)
DROP TEMPORARY TABLE IF EXISTS tmp_fix_canon;
CREATE TEMPORARY TABLE tmp_fix_canon (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  keep_id BIGINT NOT NULL
);
INSERT INTO tmp_fix_canon (name, keep_id)
SELECT name, id FROM (
  SELECT c.name AS name, c.id AS id,
         ROW_NUMBER() OVER (PARTITION BY c.name
                            ORDER BY COALESCE(cnt.cnt, 0) DESC, c.id ASC) AS rn
    FROM product_category c
    LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM product GROUP BY category_id) cnt
           ON cnt.category_id = c.id
) x WHERE rn = 1;

DROP TEMPORARY TABLE IF EXISTS tmp_fix_leaf;
CREATE TEMPORARY TABLE tmp_fix_leaf (
  legacy_post_id BIGINT NOT NULL PRIMARY KEY,
  term_id BIGINT NOT NULL,
  term_name VARCHAR(64) NOT NULL,
  depth INT NOT NULL,
  category_id BIGINT NULL
);
INSERT INTO tmp_fix_leaf (legacy_post_id, term_id, term_name, depth, category_id)
SELECT legacy_post_id, term_id, term_name, depth, category_id FROM (
  SELECT p.legacy_wp_product_id AS legacy_post_id,
         tt.term_id AS term_id,
         t.name AS term_name,
         d.depth AS depth,
         k.keep_id AS category_id,
         ROW_NUMBER() OVER (PARTITION BY p.legacy_wp_product_id
                            ORDER BY d.depth DESC, tt.term_id ASC) AS rn
    FROM product p
    JOIN wp_legacy.wp_term_relationships tr
      ON tr.object_id = p.legacy_wp_product_id
    JOIN wp_legacy.wp_term_taxonomy tt
      ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy = 'product_cat'
    JOIN wp_legacy.wp_terms t ON t.term_id = tt.term_id
    JOIN tmp_fix_depth d ON d.term_id = tt.term_id
    JOIN tmp_fix_canon k ON k.name = t.name COLLATE utf8mb4_unicode_ci
   WHERE p.legacy_wp_product_id IS NOT NULL
) x WHERE rn = 1;

SELECT '①-4 待改归属商品' AS `段`, p.id AS `商品id`, p.name AS `商品名`, p.status,
       pc.name AS `当前分类`, l.term_name AS `应归入(WP 最深 term)`, l.depth AS `term 深度`
  FROM product p
  JOIN tmp_fix_leaf l ON l.legacy_post_id = p.legacy_wp_product_id
  JOIN product_category pc ON pc.id = p.category_id
 WHERE p.category_id <> l.category_id
 ORDER BY l.term_name, p.id;

-- ①-5 目标期望 vs 当前(修复后「当前」列应与「目标」列逐项相等)
--     目标分类行数 15 = 24 行 − 9 行重复;修复后不应有任何 status 变化 ⇒ 已上架仍是 61
SELECT '①-5 目标 vs 当前' AS `段`,
       15 AS `目标分类行数`, (SELECT COUNT(*) FROM product_category) AS `当前分类行数`,
       0  AS `目标重复名数`,
       (SELECT COUNT(*) FROM (SELECT name FROM product_category GROUP BY name HAVING COUNT(*) > 1) x) AS `当前重复名数`,
       0  AS `目标未解码slug数`,
       (SELECT COUNT(*) FROM product_category WHERE slug LIKE '%\%%') AS `当前未解码slug数`,
       61 AS `目标已上架`,
       (SELECT COUNT(*) FROM product WHERE status = 'published' AND listed = 1) AS `当前已上架`,
       39 AS `目标草稿`,
       (SELECT COUNT(*) FROM product WHERE status = 'draft' AND listed = 1) AS `当前草稿`;

-- ============================================================
-- ② 快照(@apply_fix = 1 时落快照;重复执行不覆盖首份快照)
--     建表无条件执行(空表,无害)⇒ 保证 @apply_fix = 0 时也不报「表不存在」
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_shop_category_bak (
  snapshot_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  kind VARCHAR(16) NOT NULL,
  entity_id BIGINT NOT NULL,
  name VARCHAR(64) NULL,
  slug VARCHAR(64) NULL,
  parent_id BIGINT NULL,
  sort INT NULL,
  category_id BIGINT NULL,
  UNIQUE KEY uk_ops_shop_category_bak (kind, entity_id)
);

INSERT IGNORE INTO ops_shop_category_bak (kind, entity_id, name, slug, parent_id, sort)
SELECT 'category', pc.id, pc.name, pc.slug, pc.parent_id, pc.sort
  FROM product_category pc
 WHERE @apply_fix = 1;

INSERT IGNORE INTO ops_shop_category_bak (kind, entity_id, category_id)
SELECT 'product', p.id, p.category_id
  FROM product p
 WHERE @apply_fix = 1;

-- ============================================================
-- ③ 修复(@apply_fix = 1 才生效)
-- ============================================================

-- ③-1 商品归位:改到最深 WP term 对应的规范分类
UPDATE product p
  JOIN tmp_fix_leaf l ON l.legacy_post_id = p.legacy_wp_product_id
   SET p.category_id = l.category_id
 WHERE @apply_fix = 1
   AND l.category_id IS NOT NULL
   AND p.category_id <> l.category_id;

-- ③-2 删除重复分类行:同名已有规范行、自身 0 商品、无子分类引用
--     (子分类引用走派生表统计,不用 EXISTS 子查询 —— MySQL 不允许 DELETE 的
--      目标表出现在自身子查询里,报 1093)
DELETE pc
  FROM product_category pc
  JOIN tmp_fix_canon k ON k.name = pc.name COLLATE utf8mb4_unicode_ci
  LEFT JOIN (SELECT category_id, COUNT(*) AS cnt FROM product GROUP BY category_id) pcnt
         ON pcnt.category_id = pc.id
  LEFT JOIN (SELECT parent_id, COUNT(*) AS cnt FROM product_category GROUP BY parent_id) chcnt
         ON chcnt.parent_id = pc.id
 WHERE @apply_fix = 1
   AND pc.id <> k.keep_id
   AND COALESCE(pcnt.cnt, 0) = 0
   AND COALESCE(chcnt.cnt, 0) = 0;

-- ③-3 分类树重建:parent_id 按 WP 的 term 父子关系回填
--     (父子映射分两步落表 —— MySQL 不允许同一语句里两次引用同一个临时表,
--      自连接 tmp_fix_terms 会报 1137 Can't reopen table)
DROP TEMPORARY TABLE IF EXISTS tmp_fix_terms;
CREATE TEMPORARY TABLE tmp_fix_terms (
  term_id BIGINT NOT NULL PRIMARY KEY,
  term_name VARCHAR(64) NOT NULL,
  parent_term_id BIGINT NOT NULL,
  category_id BIGINT NULL
);
INSERT INTO tmp_fix_terms (term_id, term_name, parent_term_id, category_id)
SELECT tt.term_id, t.name, tt.parent, k.keep_id
  FROM wp_legacy.wp_term_taxonomy tt
  JOIN wp_legacy.wp_terms t ON t.term_id = tt.term_id
  LEFT JOIN tmp_fix_canon k ON k.name = t.name COLLATE utf8mb4_unicode_ci
 WHERE tt.taxonomy = 'product_cat';

DROP TEMPORARY TABLE IF EXISTS tmp_fix_parent_map;
CREATE TEMPORARY TABLE tmp_fix_parent_map (
  category_id BIGINT NOT NULL PRIMARY KEY,
  parent_term_id BIGINT NOT NULL
);
INSERT INTO tmp_fix_parent_map (category_id, parent_term_id)
SELECT m.category_id, m.parent_term_id
  FROM tmp_fix_terms m
 WHERE m.category_id IS NOT NULL;

-- 根分类(parent_term_id = 0)LEFT JOIN 落空 ⇒ parent_id 置 NULL
UPDATE product_category pc
  JOIN tmp_fix_parent_map mp ON mp.category_id = pc.id
  LEFT JOIN tmp_fix_terms pt ON pt.term_id = mp.parent_term_id
   SET pc.parent_id = pt.category_id
 WHERE @apply_fix = 1;

-- ③-4 排序:全局前序序 sort = parent.sort * 100 + 同父序号
--     根 sort = 同根序号 * 100;限深 ≤ 4(再深 Int 会溢出,实测量最深 3 层)
--     例:坐骑 100 消耗品 200 服务 300 传家宝 400 幻化 500 容器 600
--         传家宝子:武器 40001 布甲 40002 板甲 40003 锁甲 40004 皮甲 40005 饰品 40006
--         武器子:物理系 4000101 法术系 4000102
DROP TEMPORARY TABLE IF EXISTS tmp_fix_term_sort;
CREATE TEMPORARY TABLE tmp_fix_term_sort (
  term_id BIGINT NOT NULL PRIMARY KEY,
  sort INT NOT NULL
);
-- 递归 CTE 单独落表(不与其它临时表 JOIN —— MySQL 会对同语句里
-- 「递归 CTE + 临时表 JOIN」报 1137 Can't reopen table)
INSERT INTO tmp_fix_term_sort (term_id, sort)
WITH RECURSIVE
  r AS (
    SELECT tt.term_id AS term_id,
           tt.parent AS parent_term_id,
           ROW_NUMBER() OVER (PARTITION BY tt.parent ORDER BY tt.term_id) AS sibling_rank
      FROM wp_legacy.wp_term_taxonomy tt
     WHERE tt.taxonomy = 'product_cat'
  ),
  so AS (
    SELECT r.term_id AS term_id, r.parent_term_id, r.sibling_rank * 100 AS sort
      FROM r WHERE r.parent_term_id = 0
    UNION ALL
    SELECT c.term_id, c.parent_term_id, p.sort * 100 + c.sibling_rank
      FROM r c JOIN so p ON c.parent_term_id = p.term_id
  )
SELECT term_id, sort FROM so;

UPDATE product_category pc
  JOIN tmp_fix_terms m ON m.category_id = pc.id
  JOIN tmp_fix_term_sort o ON o.term_id = m.term_id
   SET pc.sort = o.sort
 WHERE @apply_fix = 1
   AND pc.sort <> o.sort;

-- ============================================================
-- ④ 修复后校验(只读)
-- ============================================================

-- ④-1 分类明细与商品计数(与 ①-1 逐行比对)
SELECT '④-1 分类明细' AS `段`, pc.id, pc.name, pc.slug, pc.parent_id, pc.sort,
       COALESCE(SUM(p.status = 'published' AND p.listed = 1), 0) AS `已上架`,
       COALESCE(SUM(p.status = 'draft' AND p.listed = 1), 0)       AS `草稿`,
       COUNT(p.id) AS `合计`
  FROM product_category pc
  LEFT JOIN product p ON p.category_id = pc.id
 GROUP BY pc.id, pc.name, pc.slug, pc.parent_id, pc.sort
 ORDER BY pc.sort, pc.id;

-- ④-2 期望:已上架 61 / 草稿 39 / 分类 15 行 / 重复名 0 / 未解码 slug 0
SELECT '④-2 校验' AS `段`,
       (SELECT COUNT(*) FROM product WHERE status = 'published' AND listed = 1) AS `已上架总数`,
       (SELECT COUNT(*) FROM product WHERE status = 'draft' AND listed = 1)       AS `草稿总数`,
       (SELECT COUNT(*) FROM product_category)                                   AS `分类行数`,
       (SELECT COUNT(*) FROM (SELECT name FROM product_category GROUP BY name HAVING COUNT(*) > 1) x) AS `重复名数`,
       (SELECT COUNT(*) FROM product_category WHERE slug LIKE '%\%%')            AS `未解码slug数`,
       (SELECT COUNT(*) FROM product p LEFT JOIN product_category pc ON pc.id = p.category_id WHERE pc.id IS NULL) AS `悬空归属数`;

-- ④-3 父子聚合视图(前台分面栏就是这张表)
SELECT '④-3 父子聚合' AS `段`, parent.name AS `父分类`, child.name AS `子分类`,
       COALESCE(SUM(p.status = 'published' AND p.listed = 1), 0) AS `自身在售`
  FROM product_category parent
  JOIN product_category child ON child.parent_id = parent.id
  LEFT JOIN product p ON p.category_id = child.id
 GROUP BY parent.id, parent.name, child.id, child.name, child.sort
 ORDER BY parent.sort, child.sort;
