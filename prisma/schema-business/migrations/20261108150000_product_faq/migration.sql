-- 商品常见问题(FAQ):后台按商品 CRUD,商品详情页展示
--
-- 幂等:整表用 CREATE TABLE IF NOT EXISTS(MySQL 8.4 无 CREATE TABLE IF EXISTS 之外的写法,
-- 表已存在时整条语句跳过,外键与索引随表一起跳过 → 重放零副作用)。
-- 索引与外键都写在建表语句内,避免 ALTER TABLE 形式的重放报错(索引/外键名与 datamodel 一致)。
CREATE TABLE IF NOT EXISTS `product_faq` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `product_id` BIGINT NOT NULL,
    `question` VARCHAR(255) NOT NULL,
    `answer` TEXT NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_faq_product_id_sort_idx`(`product_id`, `sort`),
    PRIMARY KEY (`id`),
    CONSTRAINT `product_faq_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
