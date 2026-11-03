-- CreateTable
CREATE TABLE `conversion_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` ENUM('product_view', 'add_cart', 'order') NOT NULL,
    `product_id` BIGINT NOT NULL,
    `user_id` BIGINT NULL,
    `qty` INTEGER NULL,
    `order_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `conversion_event_type_created_at_idx`(`type`, `created_at`),
    INDEX `conversion_event_product_id_created_at_idx`(`product_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
