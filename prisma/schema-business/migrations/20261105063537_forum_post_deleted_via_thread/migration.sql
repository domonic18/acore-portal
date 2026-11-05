-- AlterTable
ALTER TABLE `forum_post` ADD COLUMN `deleted_via_thread` BOOLEAN NOT NULL DEFAULT false;
