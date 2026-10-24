-- 开发环境初始化(M仅结构+合成种子,无生产数据 — 宪法 V / research R10)
-- 由 docker-entrypoint-initdb.d 在数据目录首次创建时执行
-- 结构依据 AzerothCore 标准 schema(与生产 acore_auth/acore_characters 一致的 M1 触碰面)

-- ===== 数据库 =====
CREATE DATABASE IF NOT EXISTS acore_auth DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS acore_characters DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS acore_world DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS eluna DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- ===== 连接账号与权限(防写根本防线,research R5) =====
-- 只读账号:四库仅 SELECT
CREATE USER 'acore_reader'@'%' IDENTIFIED BY 'reader_pass';
GRANT SELECT ON acore_auth.* TO 'acore_reader'@'%';
GRANT SELECT ON acore_characters.* TO 'acore_reader'@'%';
GRANT SELECT ON acore_world.* TO 'acore_reader'@'%';
GRANT SELECT ON eluna.* TO 'acore_reader'@'%';

-- auth 写账号:仅 account 表 INSERT/UPDATE + 全库 SELECT(注册/改密契约写)
-- (account 表级 GRANT 在下方 CREATE TABLE 之后执行——MySQL 不允许对不存在的表授权)
CREATE USER 'acore_auth_writer'@'%' IDENTIFIED BY 'auth_writer_pass';
GRANT SELECT ON acore_auth.* TO 'acore_auth_writer'@'%';

-- 业务库账号放宽(dev 便利):Prisma migrate dev 需要 shadow database
GRANT ALL PRIVILEGES ON *.* TO 'acore_portal'@'%';
FLUSH PRIVILEGES;

-- ===== acore_auth.account(契约写表,注册 INSERT / 改密 UPDATE) =====
USE acore_auth;

CREATE TABLE IF NOT EXISTS `account` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Identifier',
  `username` VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'Username(UPPER 存储)',
  `sha_pass_hash` VARCHAR(40) NOT NULL DEFAULT '' COMMENT 'SHA1(UPPER(user):UPPER(pass))',
  `sessionkey` VARCHAR(100) NOT NULL DEFAULT '',
  `v` VARCHAR(64) NOT NULL DEFAULT '',
  `s` VARCHAR(64) NOT NULL DEFAULT '',
  `token_key` VARCHAR(100) NOT NULL DEFAULT '',
  `email` VARCHAR(64) NOT NULL DEFAULT '',
  `reg_mail` VARCHAR(64) NOT NULL DEFAULT '',
  `joindate` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_ip` VARCHAR(30) NOT NULL DEFAULT '127.0.0.1',
  `last_login` TIMESTAMP NULL DEFAULT NULL,
  `failed_logins` INT UNSIGNED NOT NULL DEFAULT 0,
  `locked` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `lock_country` VARCHAR(2) NOT NULL DEFAULT '00',
  `online` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `expansion` TINYINT UNSIGNED NOT NULL DEFAULT 2,
  `mutetime` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `mutereason` VARCHAR(255) NOT NULL DEFAULT '',
  `muteby` VARCHAR(50) NOT NULL DEFAULT '',
  `locale` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `os` VARCHAR(4) NOT NULL DEFAULT '',
  `gender` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `recruiter` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_username` (`username`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '账号系统(合成种子,无生产数据)';

-- 合成种子:与业务库 seed(scripts/dev/seed.ts)的用户一一对应
-- sha_pass_hash = SHA1(UPPER(username):UPPER(password))(research R3 同密契约)
-- 明文仅存在于本地 .env 无关的种子脚本注释,不入生产
--   legacyuser / oldpass123 / 5A0E73BA023DF40E663FF0957B614246B9127FD3
--   bcryptuser / oldpass456 / 3AFFF54A14CF523DA66BBA1330F7D8FD4874986F
--   m1admin / adminpass123 / 327F3BB0E9282E6F06C2650BA2B2EC774E15717C
INSERT INTO `account` (`id`, `username`, `sha_pass_hash`, `email`, `reg_mail`) VALUES
  (1, 'LEGACYUSER', '5A0E73BA023DF40E663FF0957B614246B9127FD3', 'legacy@example.local', 'legacy@example.local'),
  (2, 'BCRYPTUSER', '3AFFF54A14CF523DA66BBA1330F7D8FD4874986F', 'bcrypt@example.local', 'bcrypt@example.local'),
  (3, 'M1ADMIN', '327F3BB0E9282E6F06C2650BA2B2EC774E15717C', 'admin@example.local', 'admin@example.local');

-- account 表已存在,补授权(写契约:注册 INSERT / 改密 UPDATE,research R5)
GRANT INSERT, UPDATE ON acore_auth.account TO 'acore_auth_writer'@'%';
FLUSH PRIVILEGES;

-- ===== acore_characters.characters(只读投影) =====
USE acore_characters;

-- M1 读取面:guid/account/name/race/class/gender/level/online;其余为常用列保留
CREATE TABLE IF NOT EXISTS `characters` (
  `guid` INT UNSIGNED NOT NULL DEFAULT 0,
  `account` INT UNSIGNED NOT NULL DEFAULT 0,
  `name` VARCHAR(12) NOT NULL DEFAULT '',
  `slot` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `race` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `class` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `gender` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `level` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `xp` INT UNSIGNED NOT NULL DEFAULT 0,
  `money` INT UNSIGNED NOT NULL DEFAULT 0,
  `playerBytes` INT UNSIGNED NOT NULL DEFAULT 0,
  `playerBytes2` INT UNSIGNED NOT NULL DEFAULT 0,
  `playerFlags` INT UNSIGNED NOT NULL DEFAULT 0,
  `position_x` FLOAT NOT NULL DEFAULT 0,
  `position_y` FLOAT NOT NULL DEFAULT 0,
  `position_z` FLOAT NOT NULL DEFAULT 0,
  `map` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `orientation` FLOAT NOT NULL DEFAULT 0,
  `taximask` LONGTEXT,
  `online` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `totaltime` INT UNSIGNED NOT NULL DEFAULT 0,
  `leveltime` INT UNSIGNED NOT NULL DEFAULT 0,
  `logout_time` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `zone` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `at_login` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `totalKills` INT UNSIGNED NOT NULL DEFAULT 0,
  `health` INT UNSIGNED NOT NULL DEFAULT 0,
  `power1` INT UNSIGNED NOT NULL DEFAULT 0,
  `power2` INT UNSIGNED NOT NULL DEFAULT 0,
  `power3` INT UNSIGNED NOT NULL DEFAULT 0,
  `power4` INT UNSIGNED NOT NULL DEFAULT 0,
  `power5` INT UNSIGNED NOT NULL DEFAULT 0,
  `equipmentCache` LONGTEXT,
  PRIMARY KEY (`guid`),
  KEY `idx_account` (`account`),
  KEY `idx_name` (`name`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '角色(合成种子,无生产数据)';

-- 合成种子:LEGACYUSER(id=1)名下 3 个 60 年代角色(S4 越权/归属校验用)
INSERT INTO `characters` (`guid`, `account`, `name`, `race`, `class`, `gender`, `level`, `map`, `zone`, `online`, `health`) VALUES
  (10, 1, 'Oldwarrior', 1, 4, 0, 60, 0, 1519, 0, 4200),
  (11, 1, 'Oldmage', 7, 8, 1, 60, 0, 1519, 0, 2900),
  (12, 1, 'Oldpriest', 10, 5, 0, 47, 1, 215, 0, 1900);

-- ===== acore_characters.recovery_item(物品恢复只读列表,与生产模块表同构) =====
-- 旧站 acore-wp-plugin 同源:SELECT Id, ItemEntry FROM recovery_item WHERE Guid = ?
CREATE TABLE IF NOT EXISTS `recovery_item` (
  `Id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Guid` INT UNSIGNED NOT NULL DEFAULT 0,
  `ItemEntry` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`Id`),
  KEY `idx_guid` (`Guid`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '待恢复物品(合成种子,无生产数据)';

-- 合成种子:Oldwarrior(guid=10)2 件可恢复物品;Oldmage(guid=11)1 件
INSERT INTO `recovery_item` (`Guid`, `ItemEntry`) VALUES
  (10, 19019),
  (10, 17182),
  (11, 22630);

-- ===== acore_world.item_template(M2 sku-check 只读校验子集,T019) =====
USE acore_world;

CREATE TABLE IF NOT EXISTS `item_template` (
  `entry` INT UNSIGNED NOT NULL DEFAULT 0,
  `name` VARCHAR(128) NOT NULL DEFAULT '',
  `quality` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`entry`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '物品模板(合成种子子集,无生产数据)';

-- 与业务库 seed 商品(SHOP_FIXTURE gameItemId)一一对应
INSERT INTO `item_template` (`entry`, `name`, `quality`) VALUES
  (19019, '测试坐骑·限量', 3),
  (19020, '测试坐骑·促销中', 3),
  (19021, '测试坐骑·促销已过期', 3)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);
