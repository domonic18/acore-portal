-- 论坛状态标签枚举增补【处理中】(in_progress)
--
-- 背景:版主受理反馈后需要表达「已受理、正在跟进/等待修复排期」这一中间态,
--       此前 none→resolved 之间无处安放,只能挂着「请补充」或无标签硬撑。
--       纯枚举加宽:全部存量值(none/resolved/needs_info/closed)都在新枚举域内,
--       无需 UPDATE 收敛,直接 MODIFY。
--
-- 幂等:MySQL DDL 非事务,迁移中途失败要能手工重放 ⇒
--   重复 MODIFY 结果一致,天然可重放。

ALTER TABLE `forum_thread`
  MODIFY COLUMN `status_label` ENUM('none', 'resolved', 'needs_info', 'in_progress', 'closed') NOT NULL DEFAULT 'none';
