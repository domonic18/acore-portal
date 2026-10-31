# 备份与恢复手册(backup-restore)

> M4 US5 T033/T034 · FR-317 · SC-308。备份脚本:`scripts/cron/backup.mjs`。
> 配置分域(宪法 VI):备份凭据(COS)、保留参数、游戏库连接串全部存业务库
> `system_config`,不入 env、不入文档、不入日志;后台「设置」页可视管理
> (admin/settings,保存即热生效)。

## 1. 备份范围

| 对象 | 来源 | 产物(COS `backups/db/`) | 频率 |
|---|---|---|---|
| 业务库 `acore_portal` | `.env` 的 `DATABASE_URL` | `lokta-business-{yyyyMMdd}.sql.gz` | 每日 |
| 游戏库 `acore_auth` | `gamedb.auth` 连接串 | `lokta-auth-{yyyyMMdd}.sql.gz` | 每周日(或 `--force-weekly`) |
| 游戏库 `acore_characters` | `gamedb.characters` | `lokta-characters-{yyyyMMdd}.sql.gz` | 同上 |
| 游戏库 `acore_world` | `gamedb.world` | `lokta-world-{yyyyMMdd}.sql.gz` | 同上 |
| 游戏库 `eluna` | `gamedb.eluna` | `lokta-eluna-{yyyyMMdd}.sql.gz` | 同上 |

- dump 参数:`mysqldump --single-transaction --routines --triggers --no-tablespaces`
  (InnoDB 一致性快照,不锁表;`--no-tablespaces` 规避 MySQL 8 非特权账号的 PROCESS 权限报错)
- 保留期:`backup.retentionDays`(默认 30;`0`=只留当日)。脚本每次运行末尾按
  文件名日期清理 `backups/db/` 前缀下的过期对象。
- 备份制品桶为私有读(wow-lokta-staging / 生产桶同权限口径),访问走 SDK 签名。

## 2. 运行方式

```bash
# 每日备份(周日在业务备份后自动追加游戏四库)
node scripts/cron/backup.mjs

# 非周日手动验证周备链路
node scripts/cron/backup.mjs --force-weekly
```

环境口径:

- `DATABASE_URL`:业务库连接(.env;亦作为 system_config 的读取来源)
- `BACKUP_MYSQL_CONTAINER`:执行 `docker exec` 的业务 MySQL 容器名,
  默认 `acore-portal-test-mysql-1`(测试栈),**生产部署时改为生产容器名**
- 退出码:0 成功;1 失败(业务库 dump 失败即退出;单游戏库失败记告警并继续,最终非零)

## 3. crontab 示例(宿主机)

```cron
# 每日 03:30 业务库备份(周日自动追加游戏四库周备)
30 3 * * * cd /path/to/acore-portal && /usr/bin/node scripts/cron/backup.mjs >> /var/log/lokta-backup.log 2>&1
```

- 调度本体在宿主 crontab(宪法 VII:M4 不建调度服务);容器编排迁移时改用
  对应的定时任务机制,脚本本身零改动。
- 日志需检查 `[backup] 失败`/非零退出码;建议接既有监控通道告警。

## 4. 恢复步骤

```bash
# 1) 从 COS 下载目标日期的备份(SDK 签名或腾讯云 coscli)
#    例:backups/db/lokta-business-20261025.sql.gz
gunzip lokta-business-20261025.sql.gz

# 2) 建临时 schema(dump 不含 CREATE DATABASE,导入哪个 schema 由导入命令指定)
mysql -uroot -p -e "CREATE SCHEMA acore_portal_restore"

# 3) 导入
mysql -uroot -p acore_portal_restore < lokta-business-20261025.sql

# 4) 行数核对(与源库一致)——user / shop_order / article 为核心账面锚点
mysql -uroot -p -e "
SELECT (SELECT COUNT(*) FROM acore_portal.user),
       (SELECT COUNT(*) FROM acore_portal.shop_order),
       (SELECT COUNT(*) FROM acore_portal.article);"

# 5) 冒烟:已发布文章数可查、system_config 关键行(app.url/smtp.*/gamedb.*)在位
# 6) 核对通过后再切换应用连接串指向恢复库;核对失败勿切换,保留现场排查
```

注意事项:

- 恢复前**先停止或改指应用写入**,避免恢复期间双写错位;
- 业务库恢复后,Redis 会话/限速/404 计数等键为易失缓存,无需恢复(丢失可重建);
- `wp_legacy`/`lokta_ref` 等迁移留档 schema 不在备份范围(只读留档,另有原始归档)。

## 5. 游戏库 dump 的两种客户端路径

游戏四库不在业务 MySQL 容器内时,`docker exec {业务容器} mysqldump -h{游戏库}` 需要
业务容器可网达游戏库(测试/同机部署即此形态,`gamedb.*` 连接串原样可用)。跨机部署二选一:

1. **宿主装 mysql-client**(推荐):crontab 环境直接
   `mysqldump -h{游戏库host} -P{port} -u{user} -p{pass} --single-transaction --no-tablespaces {db} | gzip > xxx.sql.gz`;
   此时脚本需相应改造(dump 命令从容器内改为宿主直连,连接串仍读 system_config)。
2. **在同网络的专用容器跑**:临时起带 mysql-client 的容器挂同 compose 网络,
   `docker exec` 进该容器执行 dump——不污染业务容器,适合游戏库网络隔离场景。

两种路径均保持「凭据只在内存、stderr 脱敏后回显」的宪法 VI 口径。

## 6. 配置变更重启口径

- 后台「设置」页(`/admin/settings`)保存:**即时热生效**——服务层保存后调
  `reloadSystemConfig` 写穿进程内缓存,SMTP/防滥用/通知/Turnstile/Umami 组均免重启;
- **例外(仍需重启)**:`initdb`/手改 SQL 直接写 `system_config` 的场景——web 进程
  的配置是启动时预热+进程内缓存,外部直写对长驻进程不可见,须
  `docker restart {web 容器}`;`gamedb.*` 连接串变更亦需重启(连接池惰性建连)。

## 7. 演练记录(SC-308)

- **2026-10-25 恢复演练(测试栈,通过)**:
  `node scripts/cron/backup.mjs`(周日,自动含游戏四库)→ COS 出现 5 个当日对象
  (business 8.6MB raw / 1.99MB gz;auth/characters/world/eluna 各 1 份)→
  下载 `lokta-business-20261025.sql.gz` → 解压导入临时 schema
  `acore_portal_restore_drill` → 行数核对 user 5648 / shop_order 1897 / article 124
  / notification 0,**与源库完全一致** → 冒烟 SQL 通过(published article 121、
  `app.url` 配置行在位)→ 演练后临时 schema 已删除。
  同日保留期验证:上传假旧对象 `lokta-business-20260901.sql.gz` +
  `backup.retentionDays=7` → 重跑脚本「删除 1 个过期对象」→ 参数还原缺省 30。
