-- WP Statistics 存档库(wp_legacy)分析索引 —— 后台「数据看板」聚合提速
--
-- 背景(2026-11-08 实测):
--   后台 /admin/stats 读 wp_legacy 的 WP Statistics 存档做维度聚合。
--   wp_statistics_visitor 289,246 行、wp_baiduseo_zhizhu 106,806 行,
--   而看板的时间窗过滤列(last_counter / time)虽是复合索引首列,
--   但「按维度 GROUP BY」要的不是范围,而是对每一维度值做一次覆盖扫描。
--   区间取全部(cutoff=1970)时退化为整表扫:8 条维度查询合计 1086ms,
--   看板整页 TTFB 749ms(实测公网),是后台最慢的一处。
--
-- 做法:为每个聚合维度补一条「维度列 + 时间列」覆盖索引,
--   让 GROUP BY 走索引扫描而非回表,同批 8 条查询 1086ms → 377ms(实测,本机 MySQL)。
--
-- 执行方式(一次性 DDL,人工执行;重复执行无副作用):
--   mysql -h <host> -u <user> -p <wp_legacy库名> < scripts/ops/archive-indexes.sql
--   (需 mysql 客户端,脚本用到 DELIMITER 与存储过程;用 Navicat 执行请去掉 DELIMITER 行)
--
-- 位置说明:本脚本改的是「源」存档库(wp_legacy)而非目标库,故归 scripts/ops/
--   而非 scripts/migrate/(后者每份脚本都必须是迁移链的一步)。
--
-- 幂等:逐条查 information_schema.STATISTICS,已存在则跳过。
-- 回滚:DROP INDEX 同名索引即可,不影响数据。

USE `wp_legacy`;

DROP PROCEDURE IF EXISTS `add_index_if_missing`;
DELIMITER $$
CREATE PROCEDURE `add_index_if_missing`(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

-- 访客画像四维(设备 / 操作系统 / 浏览器 / 地区)
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_device_counter',
  'CREATE INDEX `idx_visitor_device_counter` ON `wp_statistics_visitor` (`device`, `last_counter`)');
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_platform_counter',
  'CREATE INDEX `idx_visitor_platform_counter` ON `wp_statistics_visitor` (`platform`, `last_counter`)');
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_agent_counter',
  'CREATE INDEX `idx_visitor_agent_counter` ON `wp_statistics_visitor` (`agent`, `last_counter`)');
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_location_counter',
  'CREATE INDEX `idx_visitor_location_counter` ON `wp_statistics_visitor` (`location`, `last_counter`)');

-- 获客维度(搜索引擎来源名 / 直接访问计数 / 外部引荐域名 / 搜索词 URL)
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_source_counter',
  'CREATE INDEX `idx_visitor_source_counter` ON `wp_statistics_visitor` (`source_name`, `last_counter`)');
-- referred 是 text 列,只能前缀索引(64 字符足够区分域名/搜索词路径)
CALL `add_index_if_missing`('wp_statistics_visitor', 'idx_visitor_referred_counter',
  'CREATE INDEX `idx_visitor_referred_counter` ON `wp_statistics_visitor` (`referred`(64), `last_counter`)');

-- 百度蜘蛛抓取日志:按状态码聚合 + 404 URL Top N
CALL `add_index_if_missing`('wp_baiduseo_zhizhu', 'idx_baidu_type_time_num',
  'CREATE INDEX `idx_baidu_type_time_num` ON `wp_baiduseo_zhizhu` (`type`, `time`, `num`)');

DROP PROCEDURE IF EXISTS `add_index_if_missing`;

-- 尾部自检:七条索引应全部在位
SELECT TABLE_NAME, INDEX_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('wp_statistics_visitor', 'wp_baiduseo_zhizhu')
  AND INDEX_NAME LIKE 'idx\_%'
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;
