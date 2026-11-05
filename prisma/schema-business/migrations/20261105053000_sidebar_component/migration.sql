-- CreateTable
CREATE TABLE `sidebar_component` (
    `key` VARCHAR(64) NOT NULL,
    `pages` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 内置组件缺省页面范围(等价 2026-11-05 前写死行为:QQ 群/积分余额随快捷卡页,
-- 在线人数/最新资讯为文章页右栏 ArticleAside 直出)
INSERT INTO `sidebar_component` (`key`, `pages`, `updated_at`) VALUES
('points-balance', '["home","article","page"]', NOW(3)),
('qq-group', '["home","article","page"]', NOW(3)),
('server-status', '["article"]', NOW(3)),
('latest-news', '["article"]', NOW(3));
