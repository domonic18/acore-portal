-- 服务类「发货处理器键」独立于 SKU(整改 -copy 副本不可发货)
--
-- 背景:服务类 SKU 既当唯一标识又当发货处理器键,复制商品只能追加 -copy 后缀
-- ⇒ 副本 SKU 命中不了处理器注册表 ⇒ 副本永远发不出货(实测复制功能仅服务类可用,
-- 即每个副本必坏)。整改:处理器键单独落列,SKU 退回纯唯一标识。
--
-- 幂等:列存在性走 information_schema(MySQL 8.4 无 ADD COLUMN IF NOT EXISTS);
-- 回填 UPDATE 带 WHERE,重放无副作用。
SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND COLUMN_NAME = 'handler_key'),
  'SELECT 1',
  'ALTER TABLE `product` ADD COLUMN `handler_key` VARCHAR(64) NULL'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_item' AND COLUMN_NAME = 'handler_key'),
  'SELECT 1',
  'ALTER TABLE `order_item` ADD COLUMN `handler_key` VARCHAR(64) NULL'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填商品:服务类按 SKU 还原基键(6 个发货处理器键;键名本身或其 -copy 派生键)
UPDATE `product` SET `handler_key` = 'item-restoration' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'item-restoration' OR `sku` LIKE 'item-restoration-copy%');
UPDATE `product` SET `handler_key` = 'char-change-race' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'char-change-race' OR `sku` LIKE 'char-change-race-copy%');
UPDATE `product` SET `handler_key` = 'char-change-faction' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'char-change-faction' OR `sku` LIKE 'char-change-faction-copy%');
UPDATE `product` SET `handler_key` = 'char-change-customize' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'char-change-customize' OR `sku` LIKE 'char-change-customize-copy%');
UPDATE `product` SET `handler_key` = 'char-change-name' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'char-change-name' OR `sku` LIKE 'char-change-name-copy%');
UPDATE `product` SET `handler_key` = 'name-unlock' WHERE `type` = 'service' AND `handler_key` IS NULL AND (`sku` = 'name-unlock' OR `sku` LIKE 'name-unlock-copy%');

-- 回填订单行快照:历史订单行按 SKU 还原(订单行是下单时刻快照,须与当时处理器一致)
UPDATE `order_item` SET `handler_key` = 'item-restoration' WHERE `handler_key` IS NULL AND (`sku` = 'item-restoration' OR `sku` LIKE 'item-restoration-copy%');
UPDATE `order_item` SET `handler_key` = 'char-change-race' WHERE `handler_key` IS NULL AND (`sku` = 'char-change-race' OR `sku` LIKE 'char-change-race-copy%');
UPDATE `order_item` SET `handler_key` = 'char-change-faction' WHERE `handler_key` IS NULL AND (`sku` = 'char-change-faction' OR `sku` LIKE 'char-change-faction-copy%');
UPDATE `order_item` SET `handler_key` = 'char-change-customize' WHERE `handler_key` IS NULL AND (`sku` = 'char-change-customize' OR `sku` LIKE 'char-change-customize-copy%');
UPDATE `order_item` SET `handler_key` = 'char-change-name' WHERE `handler_key` IS NULL AND (`sku` = 'char-change-name' OR `sku` LIKE 'char-change-name-copy%');
UPDATE `order_item` SET `handler_key` = 'name-unlock' WHERE `handler_key` IS NULL AND (`sku` = 'name-unlock' OR `sku` LIKE 'name-unlock-copy%');
