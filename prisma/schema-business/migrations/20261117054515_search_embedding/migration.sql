-- 语义检索向量库(M8 W2):归一化 Float32 BLOB,唯一键 (entity_type, entity_id)
-- 守卫形态:内联唯一索引(规则 21 ⑦)让 CREATE TABLE IF NOT EXISTS 命中时整句跳过,
-- 兼顾重放幂等与 migrate diff 无漂移

CREATE TABLE IF NOT EXISTS `search_embedding` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_id` BIGINT NOT NULL,
  `dim` INTEGER NOT NULL,
  `content_hash` VARCHAR(64) NOT NULL,
  `vector` LONGBLOB NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `search_embedding_entity_type_entity_id_key`(`entity_type`, `entity_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
