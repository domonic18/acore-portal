# 备份与恢复手册(backup-restore)

> 备份范围:**门户站点侧**(业务库 + WP 存量存档库)。游戏四库由游戏侧部署工程每日备份,
> 不在本机制内(本仓不重复备份,也不承担游戏库的恢复责任)。
> 配置分域(宪法 VI):COS 凭据、保留天数、告警通道全部存业务库 `system_config`,
> 不入 env、不入文档、不入日志;后台「设置」页可视管理(保存即热生效)。

## 1. 备份范围与产物

| 对象 | 源 schema | 产物(COS `backups/db/`) | 频率 |
|---|---|---|---|
| 门户业务库 | `DATABASE_URL` 指向的库(生产 `acore_portal`) | `lokta-business-{yyyyMMdd}.sql.gz` | 每日 03:30 |
| WP 存量存档库 | `wp_legacy` | `lokta-wp-legacy-{yyyyMMdd}.sql.gz` | **一次性**(存量已冻结,不再定期重备) |

- 备份对象默认私有(COS 桶级 ACL 为 private),访问只走 SDK 签名;不与媒体对象混用前缀。
- dump 参数:`mysqldump --single-transaction --routines --triggers --events --no-tablespaces`
  (InnoDB 一致性快照、不锁表;`--no-tablespaces` 规避 MySQL 8 非特权账号的 PROCESS 权限报错),
  外加目标各自的 `--ignore-table` 排除表(见下)。
- **排除表**(`BACKUP_EXCLUDE_TABLES`):存量库的 `wp_statistics_pages` /
  `wp_statistics_visitor` / `wp_statistics_visitor_relationships` 三张统计表不进备份——
  它们占存量库约 73% 体积(338MB / 464MB)且是访问统计衍生数据,丢了不影响恢复能力;
  业务库不排除任何表。排除清单是**单一真相源**:dump 的 `--ignore-table` 参数与判据的
  「源表基线」都取自同一常量(否则被排除的表会被判成「dump 缺表」⇒ 每次必失败)。
- 保留期:`backup.retentionDays`(默认 30;`0`=只留当日),由脚本每次运行末尾按
  文件名日期清理 `backups/db/` 前缀下的过期对象(只认 `lokta-{target}-{yyyyMMdd}.sql.gz`
  形态,其余对象不动)。**按目标分开**:存量库标记为永久保留(`keepForever`),
  每日备份的清理线不扫存量库归档——存量只备一次,清掉就再也回不去了。
- **保留期分层**:脚本保留期是**策略**(后台可配,上限 365 天),COS 桶生命周期是**兜底**
  (脚本不跑时桶自己删,365 天)。兜底线必须 ≥ 任何可能的策略值,否则后台把保留期调大、
  桶规则却先把旧备份删了 ⇒ 设置会说谎。
- 备份清单:`backups/manifest.json`,记录每次成功备份的对象键、压缩/解压字节数、
  sha256、dump 覆盖的表名、**锚点表行数**与完成时刻。

## 2. 执行链路(宿主 → 容器)

宿主既没有 mysql client(不能 dump),也没有 node_modules 与 COS SDK(不能上传),
因此职责必须按容器切开,合并成一个脚本必然缺依赖:

```
宿主 crontab
  └─ scripts/cron/backup-run.sh          编排:容器名/目标解析、dump 落盘、清理
       ├─ web 容器: backup.ts --print-dump-args → 打印该目标的 --ignore-table 排除参数
       ├─ mysql 容器: mysqldump … <排除参数> <schema> | gzip -6 > /tmp/backup-<target>-<ts>.sql.gz
       ├─ docker cp → web 容器:/tmp/…
       └─ web 容器: tsx --conditions=react-server scripts/cron/backup.ts
                      --target <business|wp-legacy> --file /tmp/…
```

排除参数由 web 容器内的备份脚本打印(宿主不另写一份清单,避免两处漂移);
`mysqldump` 的选项必须排在库名**之前**,否则库名之后的部分会被当成表名。

`backup.ts`(web 容器内)负责:校验 → 上传 → 回读大小核对 → 写清单 → 保留期清理 → 告警。
凭据只在内存(容器自身环境变量 / system_config),不打印不落日志。

上传走**流式**(文件句柄 + ContentLength),不把压缩包整块读进内存:生产机只有
3GB 内存,存量库 dump 压缩后仍是百兆级,整块读入会和 MySQL 抢同一台机器的内存。
代价是上传中途失败不能重试(流已消费),由「上传后回读大小不一致 ⇒ 删对象」兜底。

### 成功判据(五项全过才算一次有效备份)

1. 压缩包体积达下限(`BACKUP_TARGET_META.minBytes`);
2. gzip 可完整解开(CRC 校验过、截断即失败);
3. dump 尾部有 mysqldump 完成标记(`-- Dump completed on`);
4. dump 覆盖源库**全部基础表**(逐表比对 information_schema;比对基线已剔除排除表);
5. COS 对象大小与本地一致(`headObject` 回读),且清单写入成功。

任一不满足 ⇒ **不写清单**(避免坏备份混进台账)+ 已上传对象删除 + 告警 + 退出码非零。

## 3. 调度(宿主机 crontab)

```cron
# 每日 03:30 业务库备份
30 3 * * * /home/ubuntu/acore-portal/scripts/cron/backup-run.sh >> /home/ubuntu/logs/acore-backup/backup.log 2>&1
# 每日 04:30 备份心跳检查(备份没按时跑 → 告警)
30 4 * * * /home/ubuntu/acore-portal/scripts/cron/backup-heartbeat-run.sh >> /home/ubuntu/logs/acore-backup/heartbeat.log 2>&1
```

**存量库不排期**:切换上线后 `wp_legacy` 只读冻结(最后一次写入在切换前一天),
数据不再变化,每周重备只是重复压同样的字节。改为**上线时一次性手工备**:

```bash
BACKUP_TARGETS=wp-legacy /home/ubuntu/acore-portal/scripts/cron/backup-run.sh
```

产物永久保留(`keepForever`),不参与任何保留期清理。

- 心跳检查独立于备份脚本:备份脚本「成功」不等于「按时跑过」——crontab 没挂、容器起不来、
  脚本被改坏,都可能让备份静默不跑;心跳读清单里的最新完成时刻,超 26 小时判缺失。
- 退出码:0 成功;1 失败;2 心跳缺失(与对账脚本的「有差异」同义)。
- **宿主脚本随发布下发**:`scripts/cron/backup-run.sh` / `backup-heartbeat-run.sh` 属发布资产
  (`scripts/ci/remote-release.sh` 的 `ASSETS`),每次发布同步到部署根 ⇒ 宿主编排脚本与
  镜像内的 `backup.ts` 同 commit。**禁手工改宿主那份**(改了就与镜像里的排除清单漂移)。
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
- **配置完先「测试通道」验一遍**:后台通知组有「测试通道」按钮,真发一张测试卡片
  (握手类探测证明不了签名与地址都对),成功会提示去飞书群确认收到卡片。
  测试走**未保存的候选值**,只测不存;失败按业务结果回显摘要(飞书拒绝码会原样带出),
  审计只记通道名与成败,不记地址与密钥。
- 三类卡片:备份失败(红)、心跳缺失(橙)、备份完成(绿,兼作每日心跳)。
- **降级口径**:通道未启用/未配置/故障时,备份流程照常执行,只记日志——
  告警坏掉绝不能连带备份失败(与商城发货通道同一口径)。

## 5. COS 桶生命周期(兜底清理)

脚本保留期是策略,桶生命周期是兜底:脚本挂了不跑时,桶自己按规则删旧对象。
兜底线(365 天)必须 ≥ 后台保留期上限(同样 365 天),否则设置会「说谎」。

规则只针对备份前缀,媒体对象一律不动:

| 规则 ID | 前缀 | 行为 |
|---|---|---|
| `backup-business-expire` | `backups/db/lokta-business-` | 365 天后删除(兜底) |
| (不设规则) | `backups/db/lokta-wp-legacy-` | 存量库一次性归档,永久保留 |
| (不设规则) | `backups/manifest.json` | 台账,长期留证 |

写入(幂等,覆盖式,可在 web 容器内跑):

```bash
# 预演:只打印将写入的规则
docker exec <web 容器> node_modules/.bin/tsx --conditions=react-server \
  scripts/ops/cos-lifecycle.ts --dry-run
# 写入
docker exec <web 容器> node_modules/.bin/tsx --conditions=react-server \
  scripts/ops/cos-lifecycle.ts
```

凭据取 `system_config` 的 `cos.*`(与备份脚本同源),不入命令行。

## 6. 恢复演练(非生产机)

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

### 6.1 恢复后必做:重建站内检索的 FULLTEXT 索引

站内检索关键词路走 InnoDB FULLTEXT(ngram,见 `services/search/fulltext.ts`)。
**恢复出来的行不进 FULLTEXT 索引**(存量行能否召回取决于恢复时点),表现为
「搜得到老内容、搜不到恢复后新发布的内容」,且**不报错**。

恢复完成后(以及任何大批量删改业务表之后)跑一次体检+重建:

```bash
mysql -h <host> -u <user> -p <业务库名> < scripts/ops/rebuild-fulltext-index.sql
```

脚本含只读体检段(各表最新一行是否已入索引)+ `OPTIMIZE TABLE` 重建段,
幂等可重复执行;`OPTIMIZE` 在 InnoDB 下是 rebuild+analyze,期间持表锁,
生产库按低峰窗口执行。

> **为什么不能用 `ALTER TABLE ... ADD FULLTEXT`**:它复用同一份已损坏的 FTS 辅助表,
> 实测重建后新增行依然搜不到;只有整表 recreate(`OPTIMIZE TABLE`)才恢复(2026-11-20 实测)。

## 7. 配置变更重启口径

- 后台「设置」页(`/admin/settings`)保存:**即时热生效**——服务层保存后调
  `reloadSystemConfig` 写穿进程内缓存,备份/告警等组均免重启;
- **例外(仍需重启)**:`initdb`/手改 SQL 直接写 `system_config` 的场景——web 进程
  的配置是启动时预热+进程内缓存,外部直写对长驻进程不可见,须
  `docker restart {web 容器}`;`gamedb.*` 连接串变更亦需重启(连接池惰性建连)。

## 8. 演练记录

| 日期 | 场景 | 结果 |
|---|---|---|
| 2026-11-15 | 本机演练(测试库 dump → COS → 一次性容器恢复) | 通过:40 张表、7 个锚点表行数与备份清单逐项一致 |
| 2026-11-15 | **对生产桶**做恢复演练(Mac mini + 生产桶凭据,非生产机) | 业务库通过:40 张表 / 7 锚点(user 5715、shop_order 1924、order_item 3087、product 100、article 104、media_asset 15287、point_transaction 10442) |
| 2026-11-15 | **对生产桶**恢复演练(存量库目标) | 通过:109 张表 / 5 锚点(wp_users 6398、wp_posts 5644、wp_options 1440、wp_postmeta 80135、wp_usermeta 131094) |
| 待填 | 生产环境上的恢复演练(在生产机或专用恢复机跑) | — |

演练判据(任一不满足即失败,退出码 1):
恢复后基础表数 = 清单记录的表数,且各锚点表行数与清单逐项一致——
「备份存在」不等于「备份可恢复」,只有行数对得上才算通过。

演练前提(**备份制品桶必须是私有读**):备份对象含用户口令散列等敏感数据,
落在公开读的桶里等于裸奔。落地前确认 `cos.bucket` 指向的桶 ACL 为 private;
公开读的桶(测试环境用的那种)只可用于流程自检,不得承载正式备份。

### 生产侧落地现状(2026-11-15)

- **产物**:业务库 `backups/db/lokta-business-20261115.sql.gz`(压缩 2,440,581 B /
  解压 13,038,848 B / 40 表);存量库 `backups/db/lokta-wp-legacy-20261115.sql.gz`
  (压缩 9,011,636 B / 解压 71,167,947 B / 109 表,已剔除三张统计表);
  台账 `backups/manifest.json`。
- **保留期**:后台 `backup.retentionDays` 默认 30(存量库 `keepForever`,不参与清理)。
- **桶生命周期**:已写入 `backup-business-expire` 规则(前缀 `backups/db/lokta-business-`,
  365 天后删除);存量库归档与台账不设规则。
- **crontab**:业务库每日 03:30、心跳每日 04:30(日志在运维账号家目录 `logs/acore-backup/`);
  存量库一次性手工备已跑过,不排期。
- **告警通道未配置**——飞书通道未启用,备份流程照常执行(只记日志),符合「告警降级不影响备份」口径。
