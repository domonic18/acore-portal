# 备份与恢复手册(backup-restore)

> 备份范围:**门户站点侧**(业务库 + WP 存量存档库)。游戏四库由游戏侧部署工程每日备份,
> 不在本机制内(本仓不重复备份,也不承担游戏库的恢复责任)。
> 配置分域(宪法 VI):COS 凭据、保留天数、告警通道全部存业务库 `system_config`,
> 不入 env、不入文档、不入日志;后台「设置」页可视管理(保存即热生效)。

## 1. 备份范围与产物

| 对象 | 源 schema | 产物(COS `backups/db/`) | 频率 |
|---|---|---|---|
| 门户业务库 | `DATABASE_URL` 指向的库(生产 `acore_portal`) | `lokta-business-{yyyyMMdd}.sql.gz` | 每日 03:30 |
| WP 存量存档库 | `wp_legacy` | `lokta-wp-legacy-{yyyyMMdd}.sql.gz` | 每周日 03:30 |

- 备份对象默认私有(COS 桶级 ACL 为 private),访问只走 SDK 签名;不与媒体对象混用前缀。
- dump 参数:`mysqldump --single-transaction --routines --triggers --events --no-tablespaces`
  (InnoDB 一致性快照、不锁表;`--no-tablespaces` 规避 MySQL 8 非特权账号的 PROCESS 权限报错)。
- 保留期:`backup.retentionDays`(默认 30;`0`=只留当日),由脚本每次运行末尾按
  文件名日期清理 `backups/db/` 前缀下的过期对象(只认 `lokta-{target}-{yyyyMMdd}.sql.gz`
  形态,其余对象不动)。
- 备份清单:`backups/manifest.json`,记录每次成功备份的对象键、压缩/解压字节数、
  sha256、dump 覆盖的表名、**锚点表行数**与完成时刻。

## 2. 执行链路(宿主 → 容器)

宿主既没有 mysql client(不能 dump),也没有 node_modules 与 COS SDK(不能上传),
因此职责必须按容器切开,合并成一个脚本必然缺依赖:

```
宿主 crontab
  └─ scripts/cron/backup-run.sh          编排:容器名/目标解析、dump 落盘、清理
       ├─ mysql 容器: mysqldump … | gzip -6 > /tmp/backup-<target>-<ts>.sql.gz
       ├─ docker cp → web 容器:/tmp/…
       └─ web 容器: tsx --conditions=react-server scripts/cron/backup.ts
                      --target <business|wp-legacy> --file /tmp/…
```

`backup.ts`(web 容器内)负责:校验 → 上传 → 回读大小核对 → 写清单 → 保留期清理 → 告警。
凭据只在内存(容器自身环境变量 / system_config),不打印不落日志。

上传走**流式**(文件句柄 + ContentLength),不把压缩包整块读进内存:生产机只有
3GB 内存,存量库 dump 压缩后仍是百兆级,整块读入会和 MySQL 抢同一台机器的内存。
代价是上传中途失败不能重试(流已消费),由「上传后回读大小不一致 ⇒ 删对象」兜底。

### 成功判据(五项全过才算一次有效备份)

1. 压缩包体积达下限(`BACKUP_TARGET_META.minBytes`);
2. gzip 可完整解开(CRC 校验过、截断即失败);
3. dump 尾部有 mysqldump 完成标记(`-- Dump completed on`);
4. dump 覆盖源库**全部基础表**(逐表比对 information_schema);
5. COS 对象大小与本地一致(`headObject` 回读),且清单写入成功。

任一不满足 ⇒ **不写清单**(避免坏备份混进台账)+ 已上传对象删除 + 告警 + 退出码非零。

## 3. 调度(宿主机 crontab)

```cron
# 每日 03:30 业务库备份
30 3 * * * /home/ubuntu/acore-portal/scripts/cron/backup-run.sh >> /home/ubuntu/logs/acore-backup/backup.log 2>&1
# 每周日 03:30 追加 WP 存量存档库
0 3 * * 0 BACKUP_TARGETS=wp-legacy /home/ubuntu/acore-portal/scripts/cron/backup-run.sh >> /home/ubuntu/logs/acore-backup/backup.log 2>&1
# 每日 04:30 备份心跳检查(备份没按时跑 → 告警)
30 4 * * * /home/ubuntu/acore-portal/scripts/cron/backup-heartbeat-run.sh >> /home/ubuntu/logs/acore-backup/heartbeat.log 2>&1
```

- 心跳检查独立于备份脚本:备份脚本「成功」不等于「按时跑过」——crontab 没挂、容器起不来、
  脚本被改坏,都可能让备份静默不跑;心跳读清单里的最新完成时刻,超 26 小时判缺失。
- 退出码:0 成功;1 失败;2 心跳缺失(与对账脚本的「有差异」同义)。
- 容器名可用环境变量覆盖:`BACKUP_MYSQL_CONTAINER` / `BACKUP_WEB_CONTAINER` /
  `BACKUP_TARGETS` / `BACKUP_WORK_DIR` / `BACKUP_LEGACY_SCHEMA`。
- **docker 访问方式由脚本自探**:先用 `docker`,不通再试 `sudo -n docker`(免密),
  两条都不通直接失败——生产机的运维账号不在 docker 组,但发布链路同走 `sudo docker`;
  cron 环境没有交互式密码输入,不能靠提示。
- **日志目录须对 cron 账号可写**:cron 以运维账号身份跑,别指向 `/var/log` 下
  需要 root 才能建的目录(用账号家目录下的 `logs/`)。

## 4. 告警通道(飞书自定义机器人)

- 通道配置存 `system_config` 的 `notify.*`(`feishuAlertEnabled` / `feishuWebhookUrl` /
  `feishuWebhookSecret`),后台「设置」页填,保存即热生效;密钥只写不读。
- 三类卡片:备份失败(红)、心跳缺失(橙)、备份完成(绿,兼作每日心跳)。
- **降级口径**:通道未启用/未配置/故障时,备份流程照常执行,只记日志——
  告警坏掉绝不能连带备份失败(与商城发货通道同一口径)。

## 5. 恢复演练(非生产机)

演练在**非生产机**跑,不碰生产库:下载 COS 上最新备份 → 恢复进一次性 MySQL 容器 →
逐表核对行数 → 销毁容器。

```bash
DATABASE_URL="mysql://…/acore_portal" npx tsx --conditions=react-server \
  scripts/cron/backup-drill.ts --target business [--bucket <COS 桶名>]
```

判据:恢复后基础表数 = 清单记录表数,且各锚点表行数与备份清单逐项一致。
任一不一致 ⇒ 退出码 1(演练失败,说明「备份存在但恢复不出来」)。

锚点表(清单记录备份当时的行数,库内缺表则跳过):
业务库 `user` / `shop_order` / `order_item` / `product` / `article` / `media_asset` /
`point_transaction`;存量库 `wp_users` / `wp_posts` / `wp_options` / `wp_postmeta` / `wp_usermeta`。

手工恢复(演练脚本之外的兜底路径):

```bash
# 1) 从 COS 下载目标日期的备份(SDK 签名或腾讯云 coscli)
#    例:backups/db/lokta-business-20261115.sql.gz
gunzip lokta-business-20261115.sql.gz

# 2) 建临时 schema(dump 不含 CREATE DATABASE,导入哪个 schema 由导入命令指定)
mysql -uroot -p -e "CREATE SCHEMA acore_portal_restore"

# 3) 导入
mysql -uroot -p acore_portal_restore < lokta-business-20261115.sql

# 4) 行数核对(与备份清单记录一致)——user / shop_order / article 为核心账面锚点
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
- `wp_legacy` 是只读留档,恢复只用于取证核对,不接应用连接串。

## 6. 配置变更重启口径

- 后台「设置」页(`/admin/settings`)保存:**即时热生效**——服务层保存后调
  `reloadSystemConfig` 写穿进程内缓存,备份/告警等组均免重启;
- **例外(仍需重启)**:`initdb`/手改 SQL 直接写 `system_config` 的场景——web 进程
  的配置是启动时预热+进程内缓存,外部直写对长驻进程不可见,须
  `docker restart {web 容器}`;`gamedb.*` 连接串变更亦需重启(连接池惰性建连)。

## 7. 演练记录

| 日期 | 场景 | 结果 |
|---|---|---|
| 2026-11-15 | 本机演练(测试库 dump → COS → 一次性容器恢复) | 通过:40 张表、7 个锚点表行数与备份清单逐项一致 |
| 待填 | 生产首次备份 + 非生产机恢复演练 | — |

演练判据(任一不满足即失败,退出码 1):
恢复后基础表数 = 清单记录的表数,且各锚点表行数与清单逐项一致——
「备份存在」不等于「备份可恢复」,只有行数对得上才算通过。

演练前提(**备份制品桶必须是私有读**):备份对象含用户口令散列等敏感数据,
落在公开读的桶里等于裸奔。落地前确认 `cos.bucket` 指向的桶 ACL 为 private;
公开读的桶(测试环境用的那种)只可用于流程自检,不得承载正式备份。
