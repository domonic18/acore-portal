-- M4 US4:Umami 自托管统计(独立 schema+独立账号,不与业务/游戏库混权)
-- docker-entrypoint-initdb.d 仅在数据卷首建时执行;已有卷需手动补跑本文件
CREATE DATABASE IF NOT EXISTS umami DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'umami'@'%' IDENTIFIED BY 'umami_pass';
GRANT ALL PRIVILEGES ON umami.* TO 'umami'@'%';
FLUSH PRIVILEGES;
