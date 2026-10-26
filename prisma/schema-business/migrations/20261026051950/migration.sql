-- CreateTable
CREATE TABLE `home_banner` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(64) NOT NULL,
    `image_url` VARCHAR(512) NOT NULL,
    `link_url` VARCHAR(512) NOT NULL DEFAULT '',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `home_banner_enabled_sort_idx`(`enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
