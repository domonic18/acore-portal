-- 存量时间修正:WP 本地墙钟直灌 UTC 列导致的 +8 小时偏置(2026-11-14)
--
-- 背景:
--   旧站 WordPress 的 wp_posts.post_date / post_modified 是**站点本地墙钟**
--   (旧站 timezone_string = Asia/Shanghai),而业务库的 DateTime 列语义是 UTC。
--   迁移脚本早期把 post_date 直接写进这些列,于是**存量文章发布/论坛发帖/
--   订单创建时间整体偏 8 小时**(页面上也顺延 8 小时;北京 00:00–08:00 的内容
--   还会被算到前一天)。迁移脚本已改为取 post_date_gmt
--   (见 scripts/migrate/lib/time.mjs),但**已导入的存量行不会自动更正**
--   ——导入按 legacy 键幂等跳过,重跑不覆盖 ⇒ 须一次性回填。
--
-- 口径:
--   以 wp_legacy 的 GMT 真值为准回填(而不是简单 -8 小时),因此**幂等**:
--   重跑时值已一致,零行变更。零值 gmt(草稿/待审/自动草稿)回退 post_date - 8h。
--
-- 影响面(只覆盖有 legacy 映射键的行;切换后新产生的数据不受影响):
--   article.published_at
--   forum_thread.created_at / last_post_at / closed_at
--   forum_post.created_at
--   shop_order.created_at / cancelled_at
-- 不在影响面(已核对,勿动):
--   user.created_at            —— WP user_registered 本就是 GMT
--   point_transaction.created_at—— FROM_UNIXTIME 已是 UTC
--   article.updated_at 等      —— 迁移时 NOW(),非 WP 时间
--   shop_order.paid_at/completed_at —— FROM_UNIXTIME(pay_time),已是 UTC
--
-- 执行方式(先备份,再跑):
--   mysqldump -h <host> -u <user> -p <业务库名> article forum_thread forum_post shop_order > backup.sql
--   mysql -h <host> -u <user> -p <业务库名> < scripts/ops/fix-legacy-timezone.sql
--
-- 不写死库名:由命令行 -p <业务库名> 指定(生产库名与 dev 不同);
--   wp_legacy 与业务库同实例(生产 WP dump 导入同实例),故可 JOIN 取真值。
--   若 wp_legacy 尚未导入,脚本第 ① 段会报表不存在——先导 WP dump 再跑。

-- ① 修正前核对(只读):各列与 wp_legacy 真值不一致的行数
SELECT 'article.published_at' AS `目标列`, COUNT(*) AS `偏移行数`
  FROM `article` a
  JOIN wp_legacy.wp_posts p ON p.ID = a.legacy_wp_post_id
 WHERE a.published_at IS NOT NULL
   AND a.published_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'forum_thread.created_at', COUNT(*)
  FROM `forum_thread` f
  JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
 WHERE f.created_at <> (CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
        THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'forum_thread.last_post_at', COUNT(*)
  FROM `forum_thread` f
  JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
 WHERE f.last_post_at <> GREATEST(
        CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
          THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END,
        COALESCE((SELECT MAX(CASE WHEN r.post_date_gmt > '1980-01-01 00:00:00'
            THEN r.post_date_gmt ELSE DATE_SUB(r.post_date, INTERVAL 8 HOUR) END)
          FROM wp_legacy.wp_posts r
         WHERE r.post_parent = t.ID AND r.post_type = 'reply' AND r.post_status = 'publish'),
        CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
          THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END))
UNION ALL
SELECT 'forum_thread.closed_at', COUNT(*)
  FROM `forum_thread` f
  JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
 WHERE f.closed_at IS NOT NULL
   AND f.closed_at <> (CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
        THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'forum_post.created_at', COUNT(*)
  FROM `forum_post` fp
  JOIN wp_legacy.wp_posts r ON r.ID = fp.legacy_wp_post_id
 WHERE fp.created_at <> (CASE WHEN r.post_date_gmt > '1980-01-01 00:00:00'
        THEN r.post_date_gmt ELSE DATE_SUB(r.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'shop_order.created_at', COUNT(*)
  FROM `shop_order` o
  JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
 WHERE o.created_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'shop_order.cancelled_at', COUNT(*)
  FROM `shop_order` o
  JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
 WHERE o.cancelled_at IS NOT NULL
   AND o.cancelled_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END);

-- ② 修正(幂等:回填 wp_legacy 真值,重跑零变更)

-- 文章发布时间
UPDATE `article` a
  JOIN wp_legacy.wp_posts p ON p.ID = a.legacy_wp_post_id
   SET a.published_at = (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END)
 WHERE a.published_at IS NOT NULL
   AND a.published_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END);

-- 论坛主题:创建/最后活动/关闭时间(closed_at 为空则保持为空)
UPDATE `forum_thread` f
  JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
   SET f.created_at = (CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
        THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END),
       f.closed_at = (CASE WHEN f.closed_at IS NULL THEN NULL
        ELSE (CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
          THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END) END),
       f.last_post_at = GREATEST(
        CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
          THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END,
        COALESCE((SELECT MAX(CASE WHEN r.post_date_gmt > '1980-01-01 00:00:00'
            THEN r.post_date_gmt ELSE DATE_SUB(r.post_date, INTERVAL 8 HOUR) END)
          FROM wp_legacy.wp_posts r
         WHERE r.post_parent = t.ID AND r.post_type = 'reply' AND r.post_status = 'publish'),
        CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
          THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END))
 WHERE f.legacy_wp_topic_id IS NOT NULL;

-- 论坛楼层
UPDATE `forum_post` fp
  JOIN wp_legacy.wp_posts r ON r.ID = fp.legacy_wp_post_id
   SET fp.created_at = (CASE WHEN r.post_date_gmt > '1980-01-01 00:00:00'
        THEN r.post_date_gmt ELSE DATE_SUB(r.post_date, INTERVAL 8 HOUR) END)
 WHERE fp.legacy_wp_post_id IS NOT NULL;

-- 商城订单:创建/取消时间(paid_at/completed_at 已是 UTC,不动)
UPDATE `shop_order` o
  JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
   SET o.created_at = (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END),
       o.cancelled_at = (CASE WHEN o.cancelled_at IS NULL THEN NULL
        ELSE (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
          THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END) END)
 WHERE o.legacy_wp_order_id IS NOT NULL;

-- ③ 修正后复核(只读):应全部为 0;孤儿(legacy 键在 wp_legacy 找不到)另行报告
SELECT 'article.published_at' AS `目标列`, COUNT(*) AS `仍偏移行数`
  FROM `article` a
  JOIN wp_legacy.wp_posts p ON p.ID = a.legacy_wp_post_id
 WHERE a.published_at IS NOT NULL
   AND a.published_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'forum_thread.created_at', COUNT(*)
  FROM `forum_thread` f
  JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
 WHERE f.created_at <> (CASE WHEN t.post_date_gmt > '1980-01-01 00:00:00'
        THEN t.post_date_gmt ELSE DATE_SUB(t.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'forum_post.created_at', COUNT(*)
  FROM `forum_post` fp
  JOIN wp_legacy.wp_posts r ON r.ID = fp.legacy_wp_post_id
 WHERE fp.created_at <> (CASE WHEN r.post_date_gmt > '1980-01-01 00:00:00'
        THEN r.post_date_gmt ELSE DATE_SUB(r.post_date, INTERVAL 8 HOUR) END)
UNION ALL
SELECT 'shop_order.created_at', COUNT(*)
  FROM `shop_order` o
  JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
 WHERE o.created_at <> (CASE WHEN p.post_date_gmt > '1980-01-01 00:00:00'
        THEN p.post_date_gmt ELSE DATE_SUB(p.post_date, INTERVAL 8 HOUR) END);

-- ④ 孤儿行(有 legacy 键但 wp_legacy 无对应行):JOIN 不到 ⇒ 上面的 UPDATE 覆盖不到,
--    需人工确认(正常应为 0;非 0 说明迁移源与当前 WP dump 不是同一份)
SELECT 'article' AS `表`, COUNT(*) AS `孤儿行` FROM `article` a
  LEFT JOIN wp_legacy.wp_posts p ON p.ID = a.legacy_wp_post_id
 WHERE a.legacy_wp_post_id IS NOT NULL AND p.ID IS NULL
UNION ALL
SELECT 'forum_thread', COUNT(*) FROM `forum_thread` f
  LEFT JOIN wp_legacy.wp_posts t ON t.ID = f.legacy_wp_topic_id
 WHERE f.legacy_wp_topic_id IS NOT NULL AND t.ID IS NULL
UNION ALL
SELECT 'forum_post', COUNT(*) FROM `forum_post` fp
  LEFT JOIN wp_legacy.wp_posts r ON r.ID = fp.legacy_wp_post_id
 WHERE fp.legacy_wp_post_id IS NOT NULL AND r.ID IS NULL
UNION ALL
SELECT 'shop_order', COUNT(*) FROM `shop_order` o
  LEFT JOIN wp_legacy.wp_posts p ON p.ID = o.legacy_wp_order_id
 WHERE o.legacy_wp_order_id IS NOT NULL AND p.ID IS NULL;
