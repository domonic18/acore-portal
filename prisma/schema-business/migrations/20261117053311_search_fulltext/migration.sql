-- 站内搜索(M8):五实体 ngram FULLTEXT(标题/正文分立,查询层字段加权)
-- ngram parser 无法在 prisma schema 表达(@@fulltext 不支持 parser 参数),此处手工带 WITH PARSER ngram
-- 守卫形态(INFORMATION_SCHEMA 判存 + PREPARE/EXECUTE)满足迁移重放幂等,scripts/ci/check-migration-idempotency.ts R3

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'article' AND INDEX_NAME = 'article_title_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `article_title_idx` ON `article`(`title`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'article' AND INDEX_NAME = 'article_body_md_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `article_body_md_idx` ON `article`(`body_md`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'content_page' AND INDEX_NAME = 'content_page_title_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `content_page_title_idx` ON `content_page`(`title`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'content_page' AND INDEX_NAME = 'content_page_body_md_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `content_page_body_md_idx` ON `content_page`(`body_md`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_thread' AND INDEX_NAME = 'forum_thread_title_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `forum_thread_title_idx` ON `forum_thread`(`title`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND INDEX_NAME = 'product_name_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `product_name_idx` ON `product`(`name`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product' AND INDEX_NAME = 'product_description_detail_md_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `product_description_detail_md_idx` ON `product`(`description`, `detail_md`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := IF(
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_faq' AND INDEX_NAME = 'product_faq_question_answer_idx'),
  'SELECT 1',
  'CREATE FULLTEXT INDEX `product_faq_question_answer_idx` ON `product_faq`(`question`, `answer`) WITH PARSER ngram'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
