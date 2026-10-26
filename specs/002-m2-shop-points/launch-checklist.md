# 上线前置清单(M2 T067 / M3 T049 扩)

> M2 验收在 soap-mock 下全链路完成(make check 137 vitest + 28 E2E 全绿);以下为切生产/公网前的硬性门槛。
> 状态真相源:docs/plan/development-plan.md;本文档只列前置项与操作入口。

## 1. SOAP 真机联调(M2 验收明确延后项)

- [x] 游戏库 schema 代差已适配(2026-10-25):新版 AC account 表为 SRP6(salt/verifier binary(32),无 sha_pass_hash),站点 Prisma 模型+注册/改密/激活已按 SRP6 重写(算法对齐 AC SRP6.cpp,x/verifier 均小端——BigNumber 默认 littleEndian=true,已用真机库双向量验证);dev/test 假游戏库 DDL 同步(init-game-schemas.sql)
- [ ] soap.url 指向真实 worldserver,`pnpm verify:soap` 通过
- [ ] SERVICE_COMMANDS mock 回执 vs 真机返回逐类核对(regex 桩与真机输出差异,不中即 usage error;2026-10-26 收敛后余 6 类:四角色服务+send items+transmog add,transmog 成功回执文案待首笔真单)
- [ ] `.send items` 中文邮件主题/正文真机可达(订单号入邮件,玩家可对账)

## 2. 每处理器真机抽测(handlers-status.md 六条目闭环)

- [x] 全部发货命令真机 usage 探针核对完成(2026-10-25):`.send items` 修引号形态;rename 双参形态实证为立即改名+踢在线(非下次登录);**真机无 transfer/clone/guild change 原生子命令,且 WP 旧站从未提供此三类服务——商品面对齐 WP,三 SKU 整链移除(处理器/矩阵/白名单/测试已删)**

- [ ] 6 处理器(char-change-race/faction/customize/name/name-unlock/item-restoration)各 ≥1 笔真机小额单,发货结果游戏内核实
- [ ] rename 双参(已核:立即生效)、四类服务在线/离线生效差异真机确认

## 3. SC-001 玩家真实登录(账号无感验收)

- [ ] 测试环境(dev.17aitech.com)邀请部分玩家真实登录;`$P$` 重哈希与 `$wp$` 零接触双路径各覆盖
- [ ] 备选:`pnpm verify:sc001`(读 workspace/verify-credentials.txt,100 组明文凭据方案保留待用)

## 4. COS 图片资产正式迁移(演练走 scan-only,见 migration-report.md)

- [ ] system_config 配置 cos.bucket/region/secretId/secretKey/cdnBase 五键(凭据不入 env/文档,宪法 VI)
- [ ] 切换日对最新快照按序重跑(全幂等):①`wp-users-import.sql` → ②`shop-import.sql` → ②b `slug-normalize.mjs`(WP 百分号编码 slug 解码为中文明文,对齐 M3 文章口径;动态 params 需手动 decodeURIComponent,消费端已对齐) → ③`import-points.mjs`(含 D7 差额补录+point_account 建户物化:余额=旧站 mycred_default 终值,全量 balance 与流水 SUM 零偏差) → ④`cos-upload.mjs`(去掉 `--scan-only` 即真实上传,newUrl 由 ODKU 回填 cdnBase+key)
- [ ] **SQL 执行必须带 `--default-character-set=utf8mb4`**:容器 mysql 客户端默认 latin1(无 LANG),SQL 文件内联中文字面量(legacy-deleted 商品/legacy-uncategorized 分类)会按 latin1 误读成乱码(2026-10-25 演练实翻,UPDATE 修复);WP 数据走 INSERT...SELECT 二进制安全不受累
- [ ] 迁移后提权清单(导入口径全量 role=user,特殊角色需手工提):`deadwalk`(WP ID 1,keymaster)→ admin;版主 `422169327`/`429747629`(WP ID 3/3931)如仍在任 → moderator(后台操作,或 UPDATE user.role)
- [ ] 死链扫描报告复跑归零;抽样前台图片可达

## 5. 运维接线(公网暴露前)

- [ ] crontab 接线:`pnpm cron:reconcile-points`(日终对账,退出码 2 告警)+ `pnpm cron:recover-deliveries`(delivering 超 5min 重驱动)
- [ ] 生产 compose+TLS 上线(docker/,参考 test 栈);游戏四库连接串入 system_config
- [ ] **Turnstile+登录限速实装**(宪法 VI deferral 归 M4,公网暴露前硬性要求——当前 429 语义未实装,公网放开前必须补)
- [ ] 备份:cron mysqldump 业务库+对象存储;审计日志保留策略确认

## 6. 切换观测

- [ ] 新旧并行观察期(读新写旧,M4 验收口径);1,897 存量订单页抽查与旧站对拍
- [ ] 复核清单 `/admin/review-items` 值守:切换日 D3 若出现金额不符单,人工 approve/驳回留痕

## 7. M3 内容/状态域前置项(T049 扩)

- [ ] SOAP `.server info` 真机解析核对:uptime 行/登录队列行解析正则 vs 真机输出(mock 固定样例先行,解析失败置 null 前台 N/A;在线数走 characters 库 `online=1` 计数不走文本解析,契约 specs/003 contracts/server-status.md)
- [ ] characters 今日新注册口径核对:`create_date`(unix 秒,M1 迁移既有字段)在真机库的语义确认为账号建号时间,避免状态卡统计口径漂移(T043 偏差注记)
- [ ] 内容迁移正式跑清单(切换日全幂等,顺序权威口径见 specs/003 migration-report §6):`cos-upload.mjs`(去 --scan-only,新增扫描面 forum_post.contentHtml/progression_node.imageUrl) → `content-import.mjs`(article/content_page/progression_node 三落地表+正文死链扫描) → `route-map-m3.sql`(p/page_id/cat 三键 124 行,断言见文件尾;topic/forum 两键随 `forum-import.mjs` 扩充) → 对账 JSON 全零(viewsDiffRows=0/deadlinks=0)

## 8. M4 防滥用/统计/备份前置项(T037 扩)

- [ ] Umami 生产接线:生产 compose 增 umami 服务(镜像 `ghcr.io/umami-software/umami:mysql-v2.18.0`,DB 变体 tag;勿用 v3——已弃 MySQL)+独立域名+建站取 websiteId;system_config 配 `umami.scriptUrl/websiteId`(看板聚合再加 `apiUrl/apiUsername/apiPassword`);未配置=看板降级文案不阻塞(SC-306)
- [ ] Turnstile 公网切换步骤:后台 `/admin/settings` 填真密钥 `enabled=true`(保存即热生效);切换前测试环境以 `pnpm test:e2e:turnstile`(E2E_TURNSTILE=1)全量通过为门槛;登录限速随 Redis 自动生效(默认 5 次/900s 窗口,锁 900s,`config.ts` 可调),公网放开前确认两防均已开
- [ ] 备份 crontab 挂载:`BACKUP_MYSQL_CONTAINER` 改生产业务 MySQL 容器名后挂宿主 crontab(每日 03:30,周日自动追加游戏四库;命令与日志口径见 docs/ops/backup-restore.md §3);首周人工核验 COS 对象产物并做一次恢复演练
- [ ] 游戏库 dump 客户端路径确认:mysqldump 在业务 MySQL 容器内经 `docker exec` 执行(宿主零依赖),确认生产容器名与容器内 client 可用;`gamedb.*` 连接串账号需 SELECT+LOCK TABLES 权限(`--single-transaction` 一致性快照口径)
- [ ] route-map-m4.sql 切换日执行位次:六工具页六键(page_id 537/1287/1699/1880/1897/4371)INSERT ODKU 幂等,排在 M3 内容迁移清单之后;执行后 web 容器重启生效(route_map 进程内缓存)
- [ ] 配置变更重启口径:system_config 多数键(umami/turnstile/smtp/soap/cos/备份参数)后台保存即热生效(写穿失效);唯 `gamedb.*` 四连接串改库后需 web 容器重启(进程内惰性建连,config.ts 注记)
