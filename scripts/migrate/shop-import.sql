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
-- 用户映射:acore_portal.user.wp_user_id = post_author;垃圾户(>32 login 未迁)订单跳过
-- 幂等:legacy_wp_* 唯一键 INSERT … ON DUPLICATE KEY UPDATE(重复跑零新增,验收红线);
--   分类无 legacy 键,以 slug 为幂等键
-- 注意:wp_legacy 库排序规则为 utf8mb4_unicode_520_ci(与目标 utf8mb4_unicode_ci 不同),
--   跨库字符串比较一律 COLLATE utf8mb4_unicode_ci;ON DUPLICATE KEY UPDATE 的目标列
--   一律表名限定(JOIN 了同名 id 列的表,不限定会报 ambiguous)

-- ① 分类(product_cat;slug 幂等)
INSERT INTO acore_portal.product_category (name, slug, sort)
SELECT t.name, t.slug, 0
FROM wp_legacy.wp_terms t
JOIN wp_legacy.wp_term_taxonomy tt ON tt.term_id = t.term_id AND tt.taxonomy = 'product_cat'
ON DUPLICATE KEY UPDATE product_category.id = product_category.id;

-- 分类层级映射(parent 存在才回填;两步避免 INSERT…SELECT 同表自引用)
UPDATE acore_portal.product_category pc
JOIN wp_legacy.wp_term_taxonomy tt ON tt.taxonomy = 'product_cat' AND tt.parent > 0
JOIN wp_legacy.wp_terms ct ON ct.term_id = tt.term_id AND ct.slug = pc.slug COLLATE utf8mb4_unicode_ci
JOIN wp_legacy.wp_terms pt ON pt.term_id = tt.parent
JOIN acore_portal.product_category ppc ON ppc.slug = pt.slug COLLATE utf8mb4_unicode_ci
SET pc.parent_id = ppc.id;

-- 兜底分类(存量商品无 product_cat 关联时挂靠)
INSERT INTO acore_portal.product_category (name, slug, sort)
VALUES ('存量未分类', 'legacy-uncategorized', 999)
ON DUPLICATE KEY UPDATE product_category.id = product_category.id;

-- ② 商品(publish+draft 全量;meta 透视;slug=post_name,空/超长回退 legacy-{ID})
INSERT INTO acore_portal.product
  (type, sku, name, slug, description, category_id, status, listed,
   price, sale_price, stock_enabled, stock, low_stock_threshold, game_item_id, legacy_wp_product_id,
   updated_at)
SELECT
  CASE WHEN pm.sku LIKE 'itemsend\\_%' THEN 'game_item'
       WHEN pm.sku IN ('item-restoration','char-change-race','char-change-name',
                       'char-change-faction','char-change-customize') THEN 'service'
       ELSE 'game_item' END,
  pm.sku,
  p.post_title,
  CASE WHEN CHAR_LENGTH(p.post_name) BETWEEN 1 AND 128
       THEN p.post_name ELSE CONCAT('legacy-', p.ID) END,
  COALESCE(NULLIF(p.post_excerpt, ''), ''),
  COALESCE(cat.category_id,
           (SELECT c.id FROM acore_portal.product_category c WHERE c.slug = 'legacy-uncategorized')),
  CASE WHEN p.post_status = 'publish'
         AND (pm.sku LIKE 'itemsend\\_%'
           OR pm.sku IN ('item-restoration','char-change-race','char-change-name',
                         'char-change-faction','char-change-customize'))
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
LEFT JOIN (
  SELECT tr.object_id, MIN(c.id) category_id
  FROM wp_legacy.wp_term_relationships tr
  JOIN wp_legacy.wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id AND tt.taxonomy = 'product_cat'
  JOIN wp_legacy.wp_terms t ON t.term_id = tt.term_id
  JOIN acore_portal.product_category c ON c.slug = t.slug COLLATE utf8mb4_unicode_ci
  GROUP BY tr.object_id
) cat ON cat.object_id = p.ID
WHERE p.post_type = 'product' AND p.post_status IN ('publish', 'draft')
ON DUPLICATE KEY UPDATE product.id = product.id;

-- ③ 订单(D3 清洗;金额取 _order_total,实扣取 mycred 聚合)
INSERT INTO acore_portal.shop_order
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
  CASE WHEN pay.paid = m.total THEN FROM_UNIXTIME(pay.pay_time) END,
  CASE WHEN pay.paid = m.total THEN FROM_UNIXTIME(pay.pay_time) END,
  CASE WHEN pay.paid IS NULL THEN p.post_date END,
  p.ID,
  p.post_date,
  NOW()
FROM wp_legacy.wp_posts p
JOIN acore_portal.`user` u ON u.wp_user_id = p.post_author
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

-- D3 金额不符 → 复核清单(独立于订单状态机;resolve 走后台 /admin/review-items)
INSERT INTO acore_portal.migration_review_item (legacy_wp_order_id, reason, detail)
SELECT o.legacy_wp_order_id, 'amount_mismatch',
       JSON_OBJECT('paid', pay.paid, 'expected', m.total)
FROM acore_portal.shop_order o
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
INSERT INTO acore_portal.product
  (type, sku, name, slug, description, category_id, status, listed, price, updated_at)
VALUES
  ('game_item', 'legacy-deleted', '已删除的存量商品', 'legacy-deleted',
   '存量订单引用的商品在旧站已被删除,此行仅作历史订单行快照的占位归属。',
   (SELECT c.id FROM acore_portal.product_category c WHERE c.slug = 'legacy-uncategorized'),
   'draft', 0, 0, NOW())
ON DUPLICATE KEY UPDATE product.id = product.id;

-- ④ 订单行快照(商品映射按 legacy_wp_product_id,幽灵引用落占位商品;completed 单行=delivered)
INSERT INTO acore_portal.order_item
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
FROM acore_portal.shop_order o
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
LEFT JOIN acore_portal.product prod ON prod.legacy_wp_product_id = im.product_id
JOIN acore_portal.product ghost ON ghost.sku = 'legacy-deleted'
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
  (SELECT COUNT(*) FROM acore_portal.shop_order WHERE legacy_wp_order_id IS NOT NULL) AS imported_orders,
  (SELECT COUNT(*) FROM acore_portal.shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'completed') AS d3_completed,
  (SELECT COUNT(*) FROM acore_portal.shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'cancelled') AS d3_cancelled,
  (SELECT COUNT(*) FROM acore_portal.shop_order WHERE legacy_wp_order_id IS NOT NULL AND status = 'pending') AS d3_pending_review,
  (SELECT COUNT(*) FROM acore_portal.migration_review_item WHERE resolved_at IS NULL) AS review_open,
  (SELECT COUNT(*) FROM acore_portal.product WHERE legacy_wp_product_id IS NOT NULL AND status = 'published') AS products_published,
  (SELECT COUNT(*) FROM acore_portal.product WHERE legacy_wp_product_id IS NOT NULL AND status = 'draft') AS products_draft,
  (SELECT COUNT(*) FROM acore_portal.order_item WHERE legacy_wp_order_item_id IS NOT NULL) AS imported_order_items;
