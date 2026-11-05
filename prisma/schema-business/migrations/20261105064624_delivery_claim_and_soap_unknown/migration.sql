-- AlterTable
ALTER TABLE `shop_order` ADD COLUMN `delivery_claim_until` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `soap_call` MODIFY `status` ENUM('pending', 'success', 'failed', 'unknown') NOT NULL DEFAULT 'pending';
