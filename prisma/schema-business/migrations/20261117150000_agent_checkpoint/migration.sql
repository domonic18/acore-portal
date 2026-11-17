-- Agent 会话检查点(M9 W5):对照 langgraph 官方 PostgresSaver 表结构移植为 MySQL 形态
-- 守卫形态:内联主键(规则 21 ⑦)让 CREATE TABLE IF NOT EXISTS 命中时整句跳过,
-- 兼顾重放幂等与 migrate diff 无漂移

CREATE TABLE IF NOT EXISTS `agent_checkpoint` (
  `thread_id` VARCHAR(64) NOT NULL,
  `checkpoint_ns` VARCHAR(255) NOT NULL DEFAULT '',
  `checkpoint_id` VARCHAR(64) NOT NULL,
  `parent_checkpoint_id` VARCHAR(64) NOT NULL DEFAULT '',
  `type` VARCHAR(64) NULL,
  `checkpoint` LONGBLOB NOT NULL,
  `metadata` JSON NULL,
  PRIMARY KEY (`thread_id`, `checkpoint_ns`, `checkpoint_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_writes` (
  `thread_id` VARCHAR(64) NOT NULL,
  `checkpoint_ns` VARCHAR(255) NOT NULL DEFAULT '',
  `checkpoint_id` VARCHAR(64) NOT NULL,
  `task_id` VARCHAR(64) NOT NULL,
  `task_path` VARCHAR(255) NOT NULL DEFAULT '',
  `idx` INTEGER NOT NULL,
  `channel` VARCHAR(255) NOT NULL DEFAULT '',
  `type` VARCHAR(64) NULL,
  `blob` LONGBLOB NULL,
  PRIMARY KEY (`thread_id`, `checkpoint_ns`, `checkpoint_id`, `task_id`, `idx`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
