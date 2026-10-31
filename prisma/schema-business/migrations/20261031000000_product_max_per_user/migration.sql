-- AlterTable: 商品每用户限购件数(null=不限购,存量商品默认 null)
ALTER TABLE `product` ADD COLUMN `max_per_user` INTEGER NULL;
