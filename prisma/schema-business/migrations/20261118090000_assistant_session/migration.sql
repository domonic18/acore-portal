-- 助手会话台账(2026-11-18,照 aitech-hub 形态):一行 = 一个 thread,
-- run 收尾 upsert 维护标题/提问数/token/最近活动;对话正文仍在 agent_checkpoint。
-- 幂等:索引内联建表语句(MySQL 无 CREATE INDEX IF NOT EXISTS,规则 21⑦)

CREATE TABLE IF NOT EXISTS `assistant_session` (
    `thread_id` VARCHAR(64) NOT NULL,
    `user_id` BIGINT NULL,
    `title` VARCHAR(64) NOT NULL DEFAULT '',
    `runs` INTEGER NOT NULL DEFAULT 0,
    `prompt_tokens` INTEGER NOT NULL DEFAULT 0,
    `completion_tokens` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_message_at` DATETIME(3) NOT NULL,

    INDEX `assistant_session_last_message_at_idx`(`last_message_at`),
    INDEX `assistant_session_user_id_idx`(`user_id`),
    PRIMARY KEY (`thread_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
