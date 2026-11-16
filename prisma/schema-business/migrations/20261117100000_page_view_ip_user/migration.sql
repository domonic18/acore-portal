-- 页面访问埋点扩列:原始 IP + 登录账号(看板「网站在线 / 最近访问」展示口径)
--
-- 背景:埋点原设计只存 path + 访客哈希(IP+日盐),看板无法展示「谁在访问哪个页」。
--       2026-11-17 看板改造新增「网站在线」「最近访问」面板,需要原始 IP 与账号;
--       经用户确认接受口径变化:原始 IP 仅 90 天内供后台看板展示(既有惰性清理删除),
--       前台行为与 UV 统计口径不变(visitor_id 哈希逻辑原样保留)。
--
-- 幂等:MySQL 8.4 无 ADD COLUMN IF NOT EXISTS,列存在性走 information_schema,重放零副作用。

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'page_view_event' AND COLUMN_NAME = 'ip'),
  'SELECT 1',
  'ALTER TABLE `page_view_event` ADD COLUMN `ip` VARCHAR(45) NULL'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'page_view_event' AND COLUMN_NAME = 'user_id'),
  'SELECT 1',
  'ALTER TABLE `page_view_event` ADD COLUMN `user_id` BIGINT NULL'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
