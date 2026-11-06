-- CreateTable
CREATE TABLE `page_view_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `path` VARCHAR(256) NOT NULL,
    `visitor_id` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `page_view_event_created_at_idx`(`created_at`),
    INDEX `page_view_event_path_created_at_idx`(`path`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
