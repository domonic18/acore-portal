-- AI 助手日聚合用量表(M9 W8):看板「AI 助手」面板的聚合事实源
-- 幂等:CREATE TABLE IF NOT EXISTS 命中即整句跳过(规则 21⑦)

CREATE TABLE IF NOT EXISTS `assistant_usage` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `day` CHAR(10) NOT NULL,
  `calls` INT NOT NULL DEFAULT 0,
  `failures` INT NOT NULL DEFAULT 0,
  `prompt_tokens` INT NOT NULL DEFAULT 0,
  `completion_tokens` INT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `assistant_usage_day_key` (`day`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 热门问题词(脱敏,按日计数):与日聚合表分开,计数走 upsert 原子自增
CREATE TABLE IF NOT EXISTS `assistant_usage_keyword` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `day` CHAR(10) NOT NULL,
  `keyword` VARCHAR(32) NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `assistant_usage_keyword_day_keyword` (`day`, `keyword`),
  KEY `assistant_usage_keyword_day_count` (`day`, `count`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
