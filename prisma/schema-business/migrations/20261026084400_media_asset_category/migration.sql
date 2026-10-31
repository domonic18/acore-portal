-- AlterTable
ALTER TABLE `media_asset` ADD COLUMN `category` VARCHAR(64) NOT NULL DEFAULT '其他';

-- CreateIndex
CREATE INDEX `media_asset_category_id_idx` ON `media_asset`(`category`, `id`);
