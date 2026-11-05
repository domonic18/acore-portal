-- AlterTable
ALTER TABLE `article` ADD COLUMN `toc_enabled` BOOLEAN NULL;

-- AlterTable
ALTER TABLE `content_page` ADD COLUMN `toc_enabled` BOOLEAN NULL;

-- 侧栏积分余额组件下线(注册表移除 points-balance;残留行会让整树保存校验 422)
DELETE FROM `sidebar_component` WHERE `key` = 'points-balance';

-- 开发日志页关闭左侧目录(2026-11-05 用户要求;其余页面 null=跟随全局开关)
UPDATE `content_page` SET `toc_enabled` = FALSE WHERE `slug` = 'devlog';
