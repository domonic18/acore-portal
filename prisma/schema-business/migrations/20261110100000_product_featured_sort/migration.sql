-- 首页精选商品展示序:此前精选区按 id asc 取前 4,后台无排序入口
--
-- 幂等:列存在性走 information_schema(MySQL 8.4 无 ADD COLUMN IF NOT EXISTS),重放零副作用。
SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND COLUMN_NAME = 'featured_sort'),
  'SELECT 1',
  'ALTER TABLE `product` ADD COLUMN `featured_sort` INTEGER NOT NULL DEFAULT 0'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
