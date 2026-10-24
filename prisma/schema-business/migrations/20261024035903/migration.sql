-- CreateTable
CREATE TABLE `product_category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `parent_id` BIGINT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `product_category_slug_key`(`slug`),
    INDEX `product_category_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `type` ENUM('game_item', 'service') NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `description` TEXT NOT NULL,
    `category_id` BIGINT NOT NULL,
    `status` ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
    `listed` BOOLEAN NOT NULL DEFAULT true,
    `price` INTEGER NOT NULL,
    `sale_price` INTEGER NULL,
    `sale_start` DATETIME(3) NULL,
    `sale_end` DATETIME(3) NULL,
    `stock_enabled` BOOLEAN NOT NULL DEFAULT false,
    `stock` INTEGER NULL,
    `low_stock_threshold` INTEGER NULL,
    `game_item_id` INTEGER NULL,
    `legacy_wp_product_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_sku_key`(`sku`),
    UNIQUE INDEX `product_slug_key`(`slug`),
    UNIQUE INDEX `product_legacy_wp_product_id_key`(`legacy_wp_product_id`),
    INDEX `product_category_id_status_idx`(`category_id`, `status`),
    INDEX `product_status_listed_idx`(`status`, `listed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `product_id` BIGINT NOT NULL,
    `qty` INTEGER NOT NULL,
    `params` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cart_item_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shop_order` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_no` VARCHAR(32) NOT NULL,
    `user_id` BIGINT NOT NULL,
    `status` ENUM('pending', 'paid', 'delivering', 'completed', 'delivery_failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'pending',
    `point_cost` INTEGER NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `delivering_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `refunded_at` DATETIME(3) NULL,
    `delivery_error` VARCHAR(255) NULL,
    `legacy_wp_order_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shop_order_order_no_key`(`order_no`),
    UNIQUE INDEX `shop_order_legacy_wp_order_id_key`(`legacy_wp_order_id`),
    INDEX `shop_order_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `shop_order_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `product_id` BIGINT NOT NULL,
    `sku` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `unit_price` INTEGER NOT NULL,
    `qty` INTEGER NOT NULL,
    `params` JSON NOT NULL,
    `delivery_status` ENUM('pending', 'delivered', 'failed') NOT NULL DEFAULT 'pending',
    `delivered_at` DATETIME(3) NULL,
    `soap_call_id` BIGINT NULL,
    `legacy_wp_order_item_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `order_item_legacy_wp_order_item_id_key`(`legacy_wp_order_item_id`),
    INDEX `order_item_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badge` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `level` INTEGER NOT NULL,
    `description` VARCHAR(255) NULL,

    UNIQUE INDEX `badge_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badge_grant` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `badge_id` BIGINT NOT NULL,
    `user_id` BIGINT NOT NULL,
    `granted_by` BIGINT NOT NULL,
    `point_transaction_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `badge_grant_badge_id_user_id_key`(`badge_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `image_asset_map` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `old_url` VARCHAR(512) NOT NULL,
    `new_url` VARCHAR(512) NOT NULL,
    `file_hash` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `image_asset_map_old_url_key`(`old_url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `migration_review_item` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `legacy_wp_order_id` INTEGER NOT NULL,
    `reason` VARCHAR(128) NOT NULL,
    `detail` JSON NOT NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolved_by` BIGINT NULL,

    UNIQUE INDEX `migration_review_item_legacy_wp_order_id_key`(`legacy_wp_order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_category` ADD CONSTRAINT `product_category_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `product_category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `product_category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_item` ADD CONSTRAINT `cart_item_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shop_order` ADD CONSTRAINT `shop_order_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `shop_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_item` ADD CONSTRAINT `order_item_soap_call_id_fkey` FOREIGN KEY (`soap_call_id`) REFERENCES `soap_call`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_grant` ADD CONSTRAINT `badge_grant_badge_id_fkey` FOREIGN KEY (`badge_id`) REFERENCES `badge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_grant` ADD CONSTRAINT `badge_grant_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_grant` ADD CONSTRAINT `badge_grant_granted_by_fkey` FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `badge_grant` ADD CONSTRAINT `badge_grant_point_transaction_id_fkey` FOREIGN KEY (`point_transaction_id`) REFERENCES `point_transaction`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
