-- 商城商品分类树修复 —— 回滚(2026-11-15)
--
-- 配套:scripts/ops/fix-shop-category-tree.sql
-- 数据源:ops_shop_category_bak(修复脚本 ② 段落的快照表)
-- 回滚口径:把 product / product_category 还原到**修复前**的快照状态:
--   1) 补回被删的重复分类行(原 id / name / slug / parent_id / sort 原样恢复)
--   2) 还原存活分类行的 name / slug / parent_id / sort
--   3) 还原商品的 category_id
--   幂等:重跑零变更(补插的行已存在;还原后的值已是目标值)
--
-- 前置:修复脚本的 ② 段快照已落库(ops_shop_category_bak 非空)
--   校验:SELECT kind, COUNT(*) FROM ops_shop_category_bak GROUP BY kind;
-- 执行:
--   mysql -h <host> -u <user> -p <业务库名> < scripts/ops/fix-shop-category-tree.rollback.sql
--   默认 @apply_rollback = 0 ⇒ 只跑 ① 段只读预检;
--   核对输出后把文件开头 @apply_rollback 改成 1 重跑。
--
-- 注意:回滚后 ops_shop_category_bak 保留为审计痕迹。
--       若回滚后**再次**执行修复脚本,须先清空快照表
--       (TRUNCATE TABLE ops_shop_category_bak),否则 INSERT IGNORE 不会刷新快照,
--       二次回滚会还原到**第一次修复前**的状态而非当前状态。

-- 开关:0 = 只读预检;1 = 执行回滚
SET @apply_rollback := 0;

-- ============================================================
-- ① 回滚前核对(只读)
-- ============================================================

-- ①-1 快照存在性与规模
SELECT '①-1 快照' AS `段`, kind, COUNT(*) AS `行数`, MIN(snapshot_at) AS `首份快照时刻`
  FROM ops_shop_category_bak
 GROUP BY kind;

-- ①-2 哪些分类行会被补回(修复时被删的那些)
SELECT '①-2 待补回分类' AS `段`, b.entity_id AS `id`, b.name, b.slug, b.parent_id, b.sort
  FROM ops_shop_category_bak b
  LEFT JOIN product_category pc ON pc.id = b.entity_id
 WHERE b.kind = 'category' AND pc.id IS NULL
 ORDER BY b.entity_id;

-- ①-3 哪些商品的归属会被改回
SELECT '①-3 待还原商品归属' AS `段`,
       COUNT(*) AS `行数`,
       SUM(p.category_id <> b.category_id) AS `实际会变更行数`
  FROM ops_shop_category_bak b
  JOIN product p ON p.id = b.entity_id
 WHERE b.kind = 'product';

-- ①-4 当前 vs 快照计数(回滚后 ①-5 的目标值应等于当前修复后状态)
SELECT '①-4 计数对比' AS `段`,
       (SELECT COUNT(*) FROM product_category) AS `当前分类行数`,
       (SELECT COUNT(*) FROM ops_shop_category_bak WHERE kind = 'category') AS `快照分类行数`,
       (SELECT COUNT(*) FROM product WHERE status = 'published' AND listed = 1) AS `当前已上架`,
       (SELECT COUNT(*) FROM ops_shop_category_bak b
          JOIN product p ON p.id = b.entity_id
         WHERE b.kind = 'product') AS `快照商品行数`;

-- ============================================================
-- ② 回滚(@apply_rollback = 1 才生效)
-- ============================================================

-- ②-1 补回被删的分类行(LEFT JOIN 判存在,避免子查询读目标表)
INSERT INTO product_category (id, name, slug, parent_id, sort)
SELECT b.entity_id, b.name, b.slug, b.parent_id, b.sort
  FROM ops_shop_category_bak b
  LEFT JOIN product_category pc ON pc.id = b.entity_id
 WHERE b.kind = 'category'
   AND @apply_rollback = 1
   AND pc.id IS NULL;

-- ②-2 还原存活分类行的 name / slug / parent_id / sort
UPDATE product_category pc
  JOIN ops_shop_category_bak b ON b.kind = 'category' AND b.entity_id = pc.id
   SET pc.name = b.name,
       pc.slug = b.slug,
       pc.parent_id = b.parent_id,
       pc.sort = b.sort
 WHERE @apply_rollback = 1;

-- ②-3 还原商品的 category_id
UPDATE product p
  JOIN ops_shop_category_bak b ON b.kind = 'product' AND b.entity_id = p.id
   SET p.category_id = b.category_id
 WHERE @apply_rollback = 1;

-- ============================================================
-- ③ 回滚后校验(只读)
-- ============================================================

-- ③-1 分类行数应等于快照行数,且无缺失
SELECT '③-1 分类行数' AS `段`,
       (SELECT COUNT(*) FROM product_category) AS `当前分类行数`,
       (SELECT COUNT(*) FROM ops_shop_category_bak WHERE kind = 'category') AS `快照分类行数`,
       (SELECT COUNT(*) FROM ops_shop_category_bak b
         LEFT JOIN product_category pc ON pc.id = b.entity_id
        WHERE b.kind = 'category' AND pc.id IS NULL) AS `缺失行数`;

-- ③-2 逐行比对:应无差异行
SELECT '③-2 分类属性差异' AS `段`, b.entity_id, b.name, b.slug, b.parent_id, b.sort,
       pc.name AS `现name`, pc.slug AS `现slug`, pc.parent_id AS `现parent_id`, pc.sort AS `现sort`
  FROM ops_shop_category_bak b
  JOIN product_category pc ON pc.id = b.entity_id
 WHERE b.kind = 'category'
   AND (NOT (pc.name <=> b.name) OR NOT (pc.slug <=> b.slug)
        OR NOT (pc.parent_id <=> b.parent_id) OR NOT (pc.sort <=> b.sort));

-- ③-3 商品归属差异:应无差异行
SELECT '③-3 商品归属差异' AS `段`, b.entity_id, b.category_id AS `快照归属`,
       p.category_id AS `现归属`
  FROM ops_shop_category_bak b
  JOIN product p ON p.id = b.entity_id
 WHERE b.kind = 'product'
   AND NOT (p.category_id <=> b.category_id);

-- ③-4 商品可见性未被回滚影响(published / draft 计数与修复前一致)
SELECT '③-4 商品计数' AS `段`,
       (SELECT COUNT(*) FROM product WHERE status = 'published' AND listed = 1) AS `已上架`,
       (SELECT COUNT(*) FROM product WHERE status = 'draft' AND listed = 1) AS `草稿`,
       (SELECT COUNT(*) FROM product p
         LEFT JOIN product_category pc ON pc.id = p.category_id
        WHERE pc.id IS NULL) AS `悬空归属数`;
