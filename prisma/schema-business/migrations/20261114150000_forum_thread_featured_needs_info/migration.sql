-- 论坛主题:新增「加精」标记 + 状态标签枚举调整(去掉 standard,新增 needs_info)
--
-- 背景:版主需要两个新能力——「加精」(标题前显示「精」标识)与「请补充」
--       (提示发帖人补充更多信息);原 standard(规范)语义不明,按产品口径去掉。
--       closed 已在枚举内,本次把它纳入状态下拉即可选择(关闭后禁回帖)。
--
-- 幂等:MySQL DDL 非事务,迁移中途失败要能手工重放 ⇒
--   ① 枚举收敛语句天然可重放(重复 MODIFY 结果一致);
--   ② ADD COLUMN 用 information_schema 判存(MySQL 8.4 无 ADD COLUMN IF NOT EXISTS)。

-- ① 先把旧枚举值 standard 收敛为 none(必须在 MODIFY 之前:旧值不在新枚举域内)
UPDATE `forum_thread` SET `status_label` = 'none' WHERE `status_label` = 'standard';

-- ② 枚举收敛:去掉 standard,新增 needs_info
ALTER TABLE `forum_thread`
  MODIFY COLUMN `status_label` ENUM('none', 'resolved', 'needs_info', 'closed') NOT NULL DEFAULT 'none';

-- ③ 加精标记(判存后新增,重放零副作用)
SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_thread' AND COLUMN_NAME = 'featured'),
  'SELECT 1',
  'ALTER TABLE `forum_thread` ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
