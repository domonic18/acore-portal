-- CreateTable
CREATE TABLE `article_category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `article_category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tag` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,

    UNIQUE INDEX `tag_name_key`(`name`),
    UNIQUE INDEX `tag_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_tag` (
    `article_id` BIGINT NOT NULL,
    `tag_id` BIGINT NOT NULL,

    PRIMARY KEY (`article_id`, `tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `excerpt` VARCHAR(500) NULL,
    `bodyMd` LONGTEXT NOT NULL,
    `category_id` BIGINT NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `published_at` DATETIME(3) NULL,
    `views` INTEGER NOT NULL DEFAULT 0,
    `legacy_wp_post_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `article_slug_key`(`slug`),
    UNIQUE INDEX `article_legacy_wp_post_id_key`(`legacy_wp_post_id`),
    INDEX `article_category_id_status_published_at_idx`(`category_id`, `status`, `published_at`),
    INDEX `article_status_published_at_idx`(`status`, `published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_page` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `bodyMd` LONGTEXT NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `legacy_wp_page_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_page_slug_key`(`slug`),
    UNIQUE INDEX `content_page_legacy_wp_page_id_key`(`legacy_wp_page_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progression_node` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `phase_date` DATE NOT NULL,
    `image_url` VARCHAR(500) NULL,
    `bodyMd` LONGTEXT NULL,
    `status` ENUM('locked', 'open') NOT NULL DEFAULT 'locked',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `legacy_wp_key` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `progression_node_legacy_wp_key_key`(`legacy_wp_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `media_asset` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `cos_key` VARCHAR(255) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `mime_type` VARCHAR(64) NOT NULL,
    `uploaded_by` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_asset_cos_key_key`(`cos_key`),
    INDEX `media_asset_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `article_tag` ADD CONSTRAINT `article_tag_article_id_fkey` FOREIGN KEY (`article_id`) REFERENCES `article`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_tag` ADD CONSTRAINT `article_tag_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article` ADD CONSTRAINT `article_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `article_category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media_asset` ADD CONSTRAINT `media_asset_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
