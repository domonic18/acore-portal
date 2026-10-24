-- bodyMd → body_md 列重命名(保留存量数据;MySQL RENAME COLUMN 原地改名)
ALTER TABLE `article` RENAME COLUMN `bodyMd` TO `body_md`;
ALTER TABLE `content_page` RENAME COLUMN `bodyMd` TO `body_md`;
ALTER TABLE `progression_node` RENAME COLUMN `bodyMd` TO `body_md`;
