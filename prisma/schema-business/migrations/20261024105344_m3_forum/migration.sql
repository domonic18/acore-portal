-- CreateTable
CREATE TABLE `forum_board` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(64) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `legacy_wp_forum_id` INTEGER NULL,

    UNIQUE INDEX `forum_board_slug_key`(`slug`),
    UNIQUE INDEX `forum_board_legacy_wp_forum_id_key`(`legacy_wp_forum_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `forum_thread` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `board_id` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `author_user_id` BIGINT NULL,
    `author_name` VARCHAR(64) NOT NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `closed_at` DATETIME(3) NULL,
    `status_label` ENUM('none', 'standard', 'resolved', 'closed') NOT NULL DEFAULT 'none',
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `reply_count` INTEGER NOT NULL DEFAULT 0,
    `last_post_at` DATETIME(3) NOT NULL,
    `legacy_wp_topic_id` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `forum_thread_legacy_wp_topic_id_key`(`legacy_wp_topic_id`),
    INDEX `forum_thread_board_id_deleted_at_pinned_last_post_at_idx`(`board_id`, `deleted_at`, `pinned`, `last_post_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `forum_post` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `thread_id` BIGINT NOT NULL,
    `floor` INTEGER NOT NULL,
    `author_user_id` BIGINT NULL,
    `author_name` VARCHAR(64) NOT NULL,
    `content_html` MEDIUMTEXT NOT NULL,
    `legacy_wp_post_id` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `forum_post_legacy_wp_post_id_key`(`legacy_wp_post_id`),
    INDEX `forum_post_thread_id_deleted_at_floor_idx`(`thread_id`, `deleted_at`, `floor`),
    UNIQUE INDEX `forum_post_thread_id_floor_key`(`thread_id`, `floor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `forum_thread` ADD CONSTRAINT `forum_thread_board_id_fkey` FOREIGN KEY (`board_id`) REFERENCES `forum_board`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_thread` ADD CONSTRAINT `forum_thread_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_post` ADD CONSTRAINT `forum_post_thread_id_fkey` FOREIGN KEY (`thread_id`) REFERENCES `forum_thread`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `forum_post` ADD CONSTRAINT `forum_post_author_user_id_fkey` FOREIGN KEY (`author_user_id`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
