-- AlterTable
ALTER TABLE `audit_log` MODIFY `category` ENUM('soap', 'mail', 'security', 'shop', 'admin', 'points') NOT NULL;

-- AlterTable
ALTER TABLE `point_transaction` MODIFY `type` ENUM('register_reward', 'badge_reward', 'shop_payment', 'manual_adjust', 'recurring', 'visitor_referral') NOT NULL;

-- AlterTable
ALTER TABLE `user` MODIFY `role` ENUM('user', 'moderator', 'admin') NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE `point_rule` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `event` VARCHAR(32) NOT NULL,
    `amount` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `remark` VARCHAR(128) NULL,

    UNIQUE INDEX `point_rule_event_key`(`event`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
