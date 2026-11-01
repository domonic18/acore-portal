-- CreateTable
CREATE TABLE `sidebar_card` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(64) NOT NULL,
    `title` VARCHAR(64) NOT NULL,
    `pages` JSON NOT NULL,
    `body` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sidebar_card_key_key`(`key`),
    INDEX `sidebar_card_sort_idx`(`sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sidebar_link` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `card_id` INTEGER NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `href` VARCHAR(500) NOT NULL,
    `note` VARCHAR(128) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `sidebar_link_card_id_sort_idx`(`card_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sidebar_link` ADD CONSTRAINT `sidebar_link_card_id_fkey` FOREIGN KEY (`card_id`) REFERENCES `sidebar_card`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 默认侧栏快捷卡(旧 download.* 配置的等价初始数据;后台 /admin/sidebar 可增删改)
INSERT INTO `sidebar_card` (`key`, `title`, `pages`, `body`, `sort`, `created_at`, `updated_at`) VALUES
('client', '客户端下载', '["page"]', NULL, 0, NOW(3), NOW(3)),
('patch', '补丁下载', '["page"]', NULL, 1, NOW(3), NOW(3)),
('launcher', '登录器下载', '["page"]', NULL, 2, NOW(3), NOW(3)),
('addon', '插件下载', '["page"]', NULL, 3, NOW(3), NOW(3)),
('yy', 'YY 频道', '["page"]', '频道号见公告', 4, NOW(3), NOW(3));

INSERT INTO `sidebar_link` (`card_id`, `label`, `href`, `note`, `sort`) VALUES
((SELECT `id` FROM `sidebar_card` WHERE `key` = 'client'), '客户端下载', '/tutorial#client_download', '1.12 完整客户端', 0),
((SELECT `id` FROM `sidebar_card` WHERE `key` = 'patch'), '补丁下载', '/tutorial#patch_download', 'patch-zhCN-5.MPQ', 0),
((SELECT `id` FROM `sidebar_card` WHERE `key` = 'launcher'), '登录器下载', '/tutorial#login_download', '一键登录', 0),
((SELECT `id` FROM `sidebar_card` WHERE `key` = 'addon'), '插件下载', '/post/插件下载使用方法', '整合包', 0);
