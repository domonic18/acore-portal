-- AI 模型条目 + 角色绑定(LLM 通道重构,照 aitech-hub 形态):双协议多模型条目,
-- 角色绑定一行一角色(chat/embedding),主备按 enabled 静态选边;索引/外键内联
-- 幂等:CREATE TABLE IF NOT EXISTS 命中即整句跳过(规则 21⑦)

CREATE TABLE IF NOT EXISTS `ai_model` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `protocol` VARCHAR(20) NOT NULL,
  `base_url` VARCHAR(500) NULL,
  `model_id` VARCHAR(100) NOT NULL,
  `api_key` VARCHAR(500) NULL,
  `roles` JSON NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `timeout_sec` INTEGER NOT NULL DEFAULT 120,
  `last_tested_at` DATETIME(3) NULL,
  `last_test_status` VARCHAR(10) NULL,
  `last_test_error` VARCHAR(500) NULL,
  `last_test_latency_ms` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ai_role_binding` (
  `role` VARCHAR(20) NOT NULL,
  `primary_id` INTEGER NULL,
  `backup_id` INTEGER NULL,
  `daily_max` INTEGER NOT NULL DEFAULT 20,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`role`),
  KEY `ai_role_binding_primary_id_idx` (`primary_id`),
  KEY `ai_role_binding_backup_id_idx` (`backup_id`),
  CONSTRAINT `ai_role_binding_primary_id_fkey` FOREIGN KEY (`primary_id`) REFERENCES `ai_model`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ai_role_binding_backup_id_fkey` FOREIGN KEY (`backup_id`) REFERENCES `ai_model`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 拆旧:llm 扁平组(单对话模型三件套 + embedding 三件套)被 ai_model/ai_role_binding
-- 取代;DELETE 幂等,生产未配过密钥无需数据搬移
DELETE FROM `system_config` WHERE `key` LIKE 'llm.%';
