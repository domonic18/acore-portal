-- AI 助手审计域(M9 W6):audit_category 枚举增 assistant
-- MODIFY COLUMN 幂等(重放无变更);只加枚举值不收旧值,存量行不受影响

ALTER TABLE `audit_log` MODIFY COLUMN `category` ENUM('soap', 'mail', 'security', 'shop', 'admin', 'points', 'content', 'forum', 'assistant') NOT NULL;
