-- 渐进节点图标(前台 C2 双侧时间轴中线图标,emoji;空=默认圆点)
ALTER TABLE `progression_node` ADD COLUMN `icon` VARCHAR(64) NULL AFTER `status`;
