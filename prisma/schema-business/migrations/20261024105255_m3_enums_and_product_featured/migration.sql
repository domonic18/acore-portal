-- AlterTable
ALTER TABLE `audit_log` MODIFY `category` ENUM('soap', 'mail', 'security', 'shop', 'admin', 'points', 'content', 'forum') NOT NULL;

-- AlterTable
ALTER TABLE `product` ADD COLUMN `featured` BOOLEAN NOT NULL DEFAULT false;
