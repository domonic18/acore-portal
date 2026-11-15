-- wp_legacy → 商城存量导入(分类/商品/订单/行/复核清单;积分流水与 D7 归 import-points.mjs)
-- 前置:
--   1) 目标库已完成 Prisma migrate(db:deploy,含 20261024035903)
--   2) 生产 WP 备份 dump 已导入同实例 wp_legacy 库(M1 同套路)
-- D3 清洗口径(research §4;旧插件在 woocommerce_payment_complete 同步发货、无持久化发货标记):
--   * 判据=扣分流水,而非 post_status(wc-processing 存量单可能已实际发货)
--   * 有扣分且 SUM|creds| = 订单金额 → completed(行 delivered,视为历史已发货)
--   * 有扣分但金额不符 → pending + migration_review_item(amount_mismatch,记录两口径)
--   * 无扣分 → cancelled(未支付或纯掉单,不追历史)
-- 商品:publish+draft 全量入库(用户裁决 2026-10-24:未发布商品原样保留 draft,后台可改后发布);
--   published 仅限 WP publish 且契约 SKU(itemsend_*/服务键),其余一律 draft(非契约 SKU 不能发货);
--   slug 空或超 128 字符回退 legacy-{postID}(存量 2 个 post_name 为空+5 个中文百分号编码 slug 136-145 字符);
--   gameItemId 仅 itemsend_ 还原;
--   订单行引用已删除商品(post 不存在)→落 legacy-deleted 占位商品(draft/hidden),保住行快照
-- 用户映射:user.wp_user_id = 买家 WP ID;垃圾户(>32 login 未迁)订单跳过
--   **买家的来源是 postmeta._customer_user,不是 post_author**:WooCommerce 经典存储下
--   订单的 post_author 是**站点创建者**(不是下单人),拿它映射会把全部订单挂到同一个
--   用户名下(表现为「订单列表的用户全是同一个人」)。
-- 幂等:legacy_wp_* 唯一键 INSERT … ON DUPLICATE KEY UPDATE(重复跑零新增,验收红线);
--   分类无 legacy 键 ⇒ **以分类名为幂等键**(2026-11-15 改;原以 slug 为键,而
--   slug-normalize.mjs 会把 WP 的 %xx 编码 slug 解码成中文 ⇒ 归一后重跑会插出
--   第二行同名分类,生产实测多出 9 行 0 商品重复分类)
-- 注意:wp_legacy 库排序规则为 utf8mb4_unicode_520_ci(与目标 utf8mb4_unicode_ci 不同),
--   跨库字符串比较一律 COLLATE utf8mb4_unicode_ci;ON DUPLICATE KEY UPDATE 的目标列
--   一律表名限定(JOIN 了同名 id 列的表,不限定会报 ambiguous)
-- 时区口径(2026-11-14):wp_posts.post_date 是**站点本地墙钟**(旧站 Asia/Shanghai),
--   目标库 DateTime 列是 UTC ⇒ 订单时间一律取 post_date_gmt(零值回退 post_date - 8 小时);
--   FROM_UNIXTIME 按会话时区折算,须 CONVERT_TZ 回 +00:00 才等于 UTC

-- ① 分类(product_cat)
--   口径(2026-11-15 修;根因与修复见 docs/ops/shop-category-tree-fix.md):
--   * **幂等键用分类名,不用 slug** —— slug-normalize.mjs 会把 WP 的 %xx 编码 slug
--     解码成中文,slug 在「导入 → 归一」两步之间会变;以 slug 为键的导入在归一后
--     重跑会插出第二行同名分类(生产实测多出 9 行 0 商品重复分类,且 sort 全为 0
--     ⇒ 前台 filesort 顺序随机,用户点到的第一个同名项恰好是空的那行)。
--   * 同名分类只留一行(取 term_id 最小)⇒ 目标库内分类名唯一。
--   * 已存在的行**不覆盖 slug** —— slug 归一归 slug-normalize.mjs 管(本脚本不解码)。
--   * sort 按 WP 层级排「全局前序序」:sort = parent.sort * 100 + 同父序号
--     (根分类 = 同父序号 * 100),限深 ≤ 4(Int 不溢出)——不再全 0。
DROP TEMPORARY TABLE IF EXISTS tmp_shop_cat;
CREATE TEMPORARY TABLE tmp_shop_cat (
  term_id BIGINT NOT NULL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  parent_term_id BIGINT NOT NULL
);
INSERT INTO tmp_shop_cat (term_id, name, slug, parent_term_id)
SELECT x.term_id, x.name, x.slug, x.parent_term_id
  FROM (
    SELECT tt.term_id AS term_id, t.name AS name, t.slug AS slug,
           tt.parent AS parent_term_id,
           ROW_NUMBER() OVER (PARTITION BY t.name ORDER BY tt.term_id) AS rn
      FROM wp_legacy.wp_terms t
      JOIN wp_legacy.wp_term_taxonomy tt
        ON tt.term_id = t.term_id AND tt.taxonomy = 'product_cat'
  ) x
 WHERE x.rn = 1;

-- 前序序:递归 CTE 单独落表(不与其它临时表 JOIN —— MySQL 对「递归 CTE + 临时表 JOIN」
--   报 1137 Can't reopen table)
DROP TEMPORARY TABLE IF EXISTS tmp_shop_cat_sort;
CREATE TEMPORARY TABLE tmp_shop_cat_sort (
  term_id BIGINT NOT NULL PRIMARY KEY,
  sort INT NOT NULL
);
INSERT INTO tmp_shop_cat_sort (term_id, sort)
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

-- 插缺失的分类(按**分类名**判存在;已存在的行不覆盖 slug)
INSERT INTO product_category (name, slug, sort)
SELECT c.name, c.slug, COALESCE(s.sort, 0)
  FROM tmp_shop_cat c
  LEFT JOIN product_category pc ON pc.name = c.name COLLATE utf8mb4_unicode_ci
  LEFT JOIN tmp_shop_cat_sort s ON s.term_id = c.term_id
 WHERE pc.id IS NULL;

-- 已存在的分类补 sort(前序序;slug 不动)
UPDATE product_category pc
  JOIN tmp_shop_cat c ON c.name = pc.name COLLATE utf8mb4_unicode_ci
  JOIN tmp_shop_cat_sort s ON s.term_id = c.term_id
   SET pc.sort = s.sort;

-- 分类层级映射(parent 存在才回填;父分类按**分类名**回查,不用 slug —— slug 会被归一改写)
UPDATE product_category pc
  JOIN tmp_shop_cat c ON c.name = pc.name COLLATE utf8mb4_unicode_ci
  JOIN wp_legacy.wp_term_taxonomy pt ON pt.term_id = c.parent_term_id AND pt.taxonomy = 'product_cat'
  JOIN wp_legacy.wp_terms ptm ON ptm.term_id = pt.term_id
  JOIN product_category ppc ON ppc.name = ptm.name COLLATE utf8mb4_unicode_ci
   SET pc.parent_id = ppc.id;

-- term 深度(用于商品归到最深分类;递归 CTE 单独落表)
DROP TEMPORARY TABLE IF EXISTS tmp_shop_cat_depth;
CREATE TEMPORARY TABLE tmp_shop_cat_depth (
  term_id BIGINT NOT NULL PRIMARY KEY,
  depth INT NOT NULL
);
INSERT INTO tmp_shop_cat_depth (term_id, depth)
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

-- 兜底分类(存量商品无 product_cat 关联时挂靠)
INSERT INTO product_category (name, slug, sort)
VALUES ('存量未分类', 'legacy-uncategorized', 999)
ON DUPLICATE KEY UPDATE product_category.id = product_category.id;

-- 商品 → 最深分类(落临时表,供「导入」与「归位纠正」共用)
--   商品归到**最深**的 WP product_cat term(同深取 term_id 最小 ⇒ 结果确定);
--   原口径取 MIN(c.id) 会把多分类商品压到 id 最小的那个 —— 而父分类 id 往往更小
--   ⇒ 一件挂「传家宝+武器+物理系」的商品落到「武器」,子类「物理系」恒为 0 件。
--   分类按**分类名**回查(不用 slug —— slug 会被 slug-normalize.mjs 改写)。
DROP TEMPORARY TABLE IF EXISTS tmp_shop_product_cat;
CREATE TEMPORARY TABLE tmp_shop_product_cat (
  legacy_post_id BIGINT NOT NULL PRIMARY KEY,
  category_id BIGINT NOT NULL
);
INSERT INTO tmp_shop_product_cat (legacy_post_id, category_id)
SELECT x.object_id, x.category_id
  FROM (
    SELECT tr.object_id AS object_id,
           pc.id AS category_id,
           ROW_NUMBER() OVER (PARTITION BY tr.object_id
                              ORDER BY d.depth DESC, tt.term_id ASC, pc.id ASC) AS rn
      FROM wp_legacy.wp_term_relationships tr
      JOIN wp_legacy.wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy = 'product_cat'
      JOIN wp_legacy.wp_terms t ON t.term_id = tt.term_id
      LEFT JOIN tmp_shop_cat_depth d ON d.term_id = tt.term_id
      JOIN product_category pc ON pc.name = t.name COLLATE utf8mb4_unicode_ci
  ) x
 WHERE x.rn = 1;

-- ② 商品(publish+draft 全量;meta 透视;slug=post_name,空/超长回退 legacy-{ID})
INSERT INTO product
  (type, sku, name, slug, description, category_id, status, listed,
   price, sale_price, stock_enabled, stock, low_stock_threshold, game_item_id, legacy_wp_product_id,
   updated_at)
SELECT
  CASE WHEN pm.sku LIKE 'itemsend\\_%' THEN 'game_item'
       WHEN pm.sku IN ('item-restoration','char-change-race','char-change-name',
                       'char-change-faction','char-change-customize','name-unlock') THEN 'service'
       ELSE 'game_item' END,
  pm.sku,
  p.post_title,
  CASE WHEN CHAR_LENGTH(p.post_name) BETWEEN 1 AND 128
       THEN p.post_name ELSE CONCAT('legacy-', p.ID) END,
  COALESCE(NULLIF(p.post_excerpt, ''), ''),
  COALESCE(cat.category_id,
           (SELECT c.id FROM product_category c WHERE c.slug = 'legacy-uncategorized')),
  CASE WHEN p.post_status = 'publish'
         AND (pm.sku LIKE 'itemsend\\_%'
           OR pm.sku IN ('item-restoration','char-change-race','char-change-name',
                         'char-change-faction','char-change-customize','name-unlock'))
       THEN 'published' ELSE 'draft' END,
  1,
  COALESCE(pm.regular_price, pm.price, 0),
  CASE WHEN pm.sale_price IS NOT NULL AND pm.sale_price < COALESCE(pm.regular_price, pm.price)
       THEN pm.sale_price END,
  pm.manage_stock = 'yes' AND pm.stock IS NOT NULL,
  pm.stock,
  CASE WHEN pm.manage_stock = 'yes' AND pm.stock IS NOT NULL THEN 1 END,
  CASE WHEN pm.sku LIKE 'itemsend\\_%' THEN CAST(REGEXP_SUBSTR(pm.sku, '[0-9]+') AS UNSIGNED) END,
  p.ID,
  NOW()
FROM wp_legacy.wp_posts p
JOIN (
  SELECT post_id,
         MAX(CASE WHEN meta_key = '_sku' THEN meta_value END) sku,
         MAX(CASE WHEN meta_key = '_regular_price' THEN meta_value + 0 END) regular_price,
         MAX(CASE WHEN meta_key = '_price' THEN meta_value + 0 END) price,
         MAX(CASE WHEN meta_key = '_sale_price' THEN meta_value + 0 END) sale_price,
         MAX(CASE WHEN meta_key = '_manage_stock' THEN meta_value END) manage_stock,
         MAX(CASE WHEN meta_key = '_stock' THEN meta_value + 0 END) stock
  FROM wp_legacy.wp_postmeta
  WHERE meta_key IN ('_sku','_regular_price','_price','_sale_price','_manage_stock','_stock')
  GROUP BY post_id
) pm ON pm.post_id = p.ID AND pm.sku IS NOT NULL
LEFT JOIN tmp_shop_product_cat cat ON cat.legacy_post_id = p.ID
WHERE p.post_type = 'product' AND p.post_status IN ('publish', 'draft')
ON DUPLICATE KEY UPDATE product.id = product.id;

-- ②-b 商品归位纠正(幂等自愈):上面的 INSERT 对已入库商品是 ODKU no-op,不改归属 →
-- 存量若按旧口径(MIN(c.id))落库,这里纠正到最深分类。只改归属,不改 status/listed。
UPDATE product p
  JOIN tmp_shop_product_cat leaf ON leaf.legacy_post_id = p.legacy_wp_product_id
   SET p.category_id = leaf.category_id
 WHERE p.category_id <> leaf.category_id;

-- ③ 订单(D3 清洗;金额取 _order_total,实扣取 mycred 聚合)
INSERT INTO shop_order
  (order_no, user_id, status, point_cost, paid_at, completed_at, cancelled_at, legacy_wp_order_id, created_at, updated_at)
SELECT
  CONCAT('WP', p.ID),
  u.id,
  CASE
    WHEN pay.paid IS NULL THEN 'cancelled'
    WHEN pay.paid = m.total THEN 'completed'
    ELSE 'pending'
  END,
  COALESCE(pay.paid, m.total),
  CASE WHEN pay.paid = m.total THEN CONVERT_TZ(FROM_UNIXTIME(pay.pay_time), @@session.time_zone, '+00:00') END,
  CASE WHEN pay.paid = m.total THEN CONVERT_TZ(FROM_UNIXTIME(pay.pay_time), @@session.time_zone, '+00:00') END,
  CASE WHEN pay.paid IS NULL THEN (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
      THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END) END,
  p.ID,
  CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
    THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END,
  NOW()
FROM wp_legacy.wp_posts p
-- 买家:WooCommerce 经典存储下订单的 post_author 是**站点创建者**,真正的买家在
-- postmeta._customer_user → 取它;缺失/0 才回落 post_author。
LEFT JOIN (
  SELECT post_id, MAX(meta_value + 0) customer_id
  FROM wp_legacy.wp_postmeta
  WHERE meta_key = '_customer_user'
  GROUP BY post_id
) cust ON cust.post_id = p.ID
JOIN `user` u ON u.wp_user_id = COALESCE(NULLIF(cust.customer_id, 0), p.post_author)
JOIN (
  SELECT post_id, MAX(CASE WHEN meta_key = '_order_total' THEN meta_value + 0 END) total
  FROM wp_legacy.wp_postmeta
  WHERE meta_key = '_order_total'
  GROUP BY post_id
) m ON m.post_id = p.ID
LEFT JOIN (
  SELECT ref_id, SUM(ABS(creds)) paid, MAX(time) pay_time
  FROM wp_legacy.wp_myCRED_log
  WHERE ref = 'woocommerce_payment'
  GROUP BY ref_id
) pay ON pay.ref_id = p.ID
WHERE p.post_type = 'shop_order' AND p.post_status LIKE 'wc-%'
ON DUPLICATE KEY UPDATE shop_order.id = shop_order.id;

-- ③-b 买家纠正(幂等自愈):上面的 INSERT 对已入库订单是 no-op ODKU,不会改买家 →
-- 存量订单若曾用 post_author 导入(全挂创建者),这里按源库真值纠正。
-- 不用 VALUES() 更新:MySQL 8.4 已移除该函数,且 INSERT…SELECT 不支持行别名(见文件头)。
UPDATE shop_order o
JOIN wp_legacy.wp_postmeta pm ON pm.post_id = o.legacy_wp_order_id AND pm.meta_key = '_customer_user'
JOIN `user` u ON u.wp_user_id = pm.meta_value + 0
SET o.user_id = u.id
WHERE o.legacy_wp_order_id IS NOT NULL AND pm.meta_value + 0 > 0;

-- D3 金额不符 → 复核清单(独立于订单状态机;resolve 走后台 /admin/review-items)
INSERT INTO migration_review_item (legacy_wp_order_id, reason, detail)
SELECT o.legacy_wp_order_id, 'amount_mismatch',
       JSON_OBJECT('paid', pay.paid, 'expected', m.total)
FROM shop_order o
JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
JOIN (
  SELECT post_id, MAX(CASE WHEN meta_key = '_order_total' THEN meta_value + 0 END) total
  FROM wp_legacy.wp_postmeta
  WHERE meta_key = '_order_total'
  GROUP BY post_id
) m ON m.post_id = p.ID
LEFT JOIN (
  SELECT ref_id, SUM(ABS(creds)) paid
  FROM wp_legacy.wp_myCRED_log
  WHERE ref = 'woocommerce_payment'
  GROUP BY ref_id
) pay ON pay.ref_id = p.ID
WHERE o.status = 'pending' AND o.legacy_wp_order_id IS NOT NULL
ON DUPLICATE KEY UPDATE migration_review_item.id = migration_review_item.id;

-- 幽灵商品占位(存量 283 行引用的商品在旧站已删除,_product_id 指向不存在的 post;
--   237 单全行皆幽灵,不落占位则订单详情零商品行)。draft+listed=0 永不进目录;
--   legacy_wp_product_id 置 NULL,不计入迁移商品报告口径
INSERT INTO product
  (type, sku, name, slug, description, category_id, status, listed, price, updated_at)
VALUES
  ('game_item', 'legacy-deleted', '已删除的存量商品', 'legacy-deleted',
   '存量订单引用的商品在旧站已被删除,此行仅作历史订单行快照的占位归属。',
   (SELECT c.id FROM product_category c WHERE c.slug = 'legacy-uncategorized'),
   'draft', 0, 0, NOW())
ON DUPLICATE KEY UPDATE product.id = product.id;

-- ④ 订单行快照(商品映射按 legacy_wp_product_id,幽灵引用落占位商品;completed 单行=delivered)
INSERT INTO order_item
  (order_id, product_id, sku, name, unit_price, qty, params, delivery_status, delivered_at, legacy_wp_order_item_id)
SELECT
  o.id,
  COALESCE(prod.id, ghost.id),
  COALESCE(im.sku, prod.sku, ghost.sku),
  oi.order_item_name,
  ROUND(im.line_total / NULLIF(im.qty, 0)),
  im.qty,
  COALESCE(guid_json.j, JSON_OBJECT()),
  IF(o.status = 'completed', 'delivered', 'pending'),
  IF(o.status = 'completed', o.paid_at, NULL),
  oi.order_item_id
FROM shop_order o
JOIN wp_legacy.wp_woocommerce_order_items oi ON oi.order_id = o.legacy_wp_order_id AND oi.order_item_type = 'line_item'
JOIN (
  SELECT order_item_id,
         MAX(CASE WHEN meta_key = '_product_id' THEN meta_value + 0 END) product_id,
         MAX(CASE WHEN meta_key = '_qty' THEN meta_value + 0 END) qty,
         MAX(CASE WHEN meta_key = '_line_total' THEN meta_value + 0 END) line_total,
         MAX(CASE WHEN meta_key = 'acore_item_sku' THEN meta_value END) sku
  FROM wp_legacy.wp_woocommerce_order_itemmeta
  WHERE meta_key IN ('_product_id','_qty','_line_total','acore_item_sku')
  GROUP BY order_item_id
) im ON im.order_item_id = oi.order_item_id
LEFT JOIN product prod ON prod.legacy_wp_product_id = im.product_id
JOIN product ghost ON ghost.sku = 'legacy-deleted'
LEFT JOIN (
  SELECT order_item_id, JSON_OBJECT('characterGuid', MAX(CAST(meta_value AS UNSIGNED))) j
  FROM wp_legacy.wp_woocommerce_order_itemmeta
  WHERE meta_key = 'acore_char_guid'
  GROUP BY order_item_id
) guid_json ON guid_json.order_item_id = oi.order_item_id
WHERE o.legacy_wp_order_id IS NOT NULL
ON DUPLICATE KEY UPDATE order_item.id = order_item.id;

-- 迁移结果报告(D3 分布 + 跳过清单口径)
SELECT
  (SELECT COUNT(*) FROM wp_legacy.wp_posts WHERE post_type = 'shop_order' AND post_status LIKE 'wc-%') AS wp_orders,
  (SELECT COUNT(*) FROM shop_order WHERE legacy_wp_order_id IS NOT NULL) AS imported_orders,
  (SELECT COUNT(*) FROM shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'completed') AS d3_completed,
  (SELECT COUNT(*) FROM shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'cancelled') AS d3_cancelled,
  (SELECT COUNT(*) FROM shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'pending') AS d3_pending_review,
  (SELECT COUNT(*) FROM migration_review_item WHERE resolved_at IS NULL) AS review_open,
  (SELECT COUNT(*) FROM product WHERE legacy_wp_product_id IS NOT NULL AND status = 'published') AS products_published,
  (SELECT COUNT(*) FROM product WHERE legacy_wp_product_id IS NOT NULL AND status = 'draft') AS products_draft,
  (SELECT COUNT(*) FROM order_item WHERE legacy_wp_order_item_id IS NOT NULL) AS imported_order_items,
  (SELECT COUNT(*) FROM product_category) AS categories,
  (SELECT COUNT(*) FROM (SELECT name FROM product_category GROUP BY name HAVING COUNT(*) > 1) x) AS category_dup_names,
  (SELECT COUNT(*) FROM product p LEFT JOIN product_category c ON c.id = p.category_id
    WHERE p.legacy_wp_product_id IS NOT NULL AND c.id IS NULL) AS product_uncategorized;
