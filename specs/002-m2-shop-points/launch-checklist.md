# 上线前置清单(M2 T067 / M3 T049 扩)

> M2 验收在 soap-mock 下全链路完成(make check 137 vitest + 28 E2E 全绿);以下为切生产/公网前的硬性门槛。
> 状态真相源:docs/plan/development-plan.md;本文档只列前置项与操作入口。

## 1. SOAP 真机联调(M2 验收明确延后项)

- [x] 游戏库 schema 代差已适配(2026-10-25):新版 AC account 表为 SRP6(salt/verifier binary(32),无 sha_pass_hash),站点 Prisma 模型+注册/改密/激活已按 SRP6 重写(算法对齐 AC SRP6.cpp,x/verifier 均小端——BigNumber 默认 littleEndian=true,已用真机库双向量验证);dev/test 假游戏库 DDL 同步(init-game-schemas.sql)
- [x] soap.url 指向真实 worldserver,`pnpm verify:soap` 通过(2026-10-26,test 栈 system_config soap.url=host.docker.internal:7878=本地真机容器 ac-worldserver;`.server info` 成功,审计 soap_attempt 留痕)
- [x] SERVICE_COMMANDS mock 回执 vs 真机返回逐类核对(regex 桩与真机输出差异,不中即 usage error;2026-10-26 收敛后余 6 类:四角色服务+send items+transmog add;2026-10-26 真机 8 单全成功=六类回执 regex 全命中,transmog add 首笔真单 success 回执确认)
- [x] `.send items` 中文邮件主题/正文真机可达(2026-10-26,真机 mail 表两封落地:装备恢复单+商品单,主题含订单号,附件 item_instance 数量正确;utf8mb4 无乱码)

## 2. 每处理器真机抽测(handlers-status.md 六条目闭环)

- [x] 全部发货命令真机 usage 探针核对完成(2026-10-25):`.send items` 修引号形态;rename 双参形态实证为立即改名+踢在线(非下次登录);**真机无 transfer/clone/guild change 原生子命令,且 WP 旧站从未提供此三类服务——商品面对齐 WP,三 SKU 整链移除(处理器/矩阵/白名单/测试已删)**

- [x] 6 处理器(char-change-race/faction/customize/name/name-unlock/item-restoration)各 ≥1 笔真机小额单,发货结果游戏内核实(2026-10-26,QA 账号 qasix977720/角色 Qaman→Qasixhero 共 8 单全 completed:改种族 at_login=128 置位下次登录自选;改阵营/faction+customize/rename 标志累积 at_login=201;name-unlock 入车规范化 Qasixhero+双参 rename 立即改名实证;item-restoration 走 `.send items` 邮件附件 19019 落真机;顺带 itemsend_90000_stack qty=3 堆叠单参 `90000:3`+transmog-item_12584 真机 custom_unlocked_appearances 按账号收藏解锁(4990,12584),与契约「外观收藏性质」一致;另核销后台补发链路:首单因手工插行不在 worldserver 角色缓存而 failed,重启容器后 /api/admin/orders/2049/redeliver 补发成功,幂等键=order_item.id 生效)
- [ ] rename 双参(已核:立即生效)、四类服务在线/离线生效差异真机确认(2026-10-26:离线态全链路 8 单覆盖✓;余在线生效差异——rename 踢在线、邮件即时投递——QA 无法低成本使角色在线,随 §3 SC-001 玩家真实登录时观察核销)

## 3. SC-001 玩家真实登录(账号无感验收)

- [ ] 测试环境(dev.17aitech.com)邀请部分玩家真实登录;`$P$` 重哈希与 `$wp$` 零接触双路径各覆盖
- [ ] 备选:`pnpm verify:sc001`(读 workspace/verify-credentials.txt,100 组明文凭据方案保留待用)

## 4. 数据迁移链执行(切换日一条命令,权威顺序见 scripts/migrate/README.md)

> 2026-11-07 起迁移链由编排器收口:`pnpm migrate:rehearse` 按权威顺序逐步执行、
> 失败即停、链末统一对账(`FAIL>0` → 退出码 1)。**不再手工按脚本逐个跑**——
> 顺序错了事后无从发现(内容/论坛导入的 `NOT EXISTS` 守卫会让"媒体映射未跑就导内容"
> 永久落死链 URL,补跑救不回来)。

- [ ] **切换前先在新站建好管理员账号**:`media_asset.uploaded_by` 是非空外键,
      而迁移链只导 `role=user` 的存量用户、**链本身不建管理员**。
      或给编排器 `MIGRATE_ADMIN_USERNAME` / `MIGRATE_ADMIN_PASSWORD` 让它代建(建完即在后台改密)
- [ ] system_config 配置 cos.bucket/region/secretId/secretKey/cdnBase 五键(凭据不入 env/文档,宪法 VI);
      **`cos.cdnBase` 缺失时媒体链失败关闭**(拒绝把正文图片 URL 改写成无效值)
- [ ] 切换日演练一遍全链(空跑不入库、只验顺序与前置):`pnpm migrate:rehearse --list` 核对顺序,
      再对独立演练 schema 跑一次 `--fresh --yes --with-media --scan-only --cdn-base https://cdn.example.invalid`
      ——须 14/14 步过、对账 FAIL 0
- [ ] 切换日对最新快照正式跑:`pnpm migrate:rehearse --yes --with-media`(全幂等,可重跑)。
      覆盖 users/shop/slug/points/content/forum/route-map×2/board-descriptions/guide-pages/
      product-images/media-library/media-verify 共 14 步
- [ ] **SQL 执行必须带 `--default-character-set=utf8mb4`**:容器 mysql 客户端默认 latin1(无 LANG),SQL 文件内联中文字面量(legacy-deleted 商品/legacy-uncategorized 分类)会按 latin1 误读成乱码(2026-10-25 演练实翻,UPDATE 修复);WP 数据走 INSERT...SELECT 二进制安全不受累
- [ ] 迁移后提权清单(导入口径全量 role=user,特殊角色需手工提):`deadwalk`(WP ID 1,keymaster)→ admin;版主 `422169327`/`429747629`(WP ID 3/3931)如仍在任 → moderator(后台操作,或 UPDATE user.role)
- [ ] 死链扫描报告复跑归零;抽样前台图片可达

## 5. 运维接线(公网暴露前)

- [ ] crontab 接线:`pnpm cron:reconcile-points`(日终对账,退出码 2 告警)+ `pnpm cron:recover-deliveries`(delivering 超 5min 重驱动)
- [ ] 生产 compose+TLS 上线(docker/,参考 test 栈);游戏四库连接串入 system_config
- [ ] **人机校验+登录限速实装**(宪法 VI deferral 归 M4,公网暴露前硬性要求——公网放开前必须补齐;人机校验厂商 2026-11-07 由 Cloudflare Turnstile 换为腾讯云验证码)
- [ ] 备份:cron mysqldump 业务库+对象存储;审计日志保留策略确认

## 6. 切换观测

- [ ] 新旧并行观察期(读新写旧,M4 验收口径);1,897 存量订单页抽查与旧站对拍
- [ ] 复核清单 `/admin/review-items` 值守:切换日 D3 若出现金额不符单,人工 approve/驳回留痕

## 7. M3 内容/状态域前置项(T049 扩)

- [x] SOAP `.server info` 真机解析核对:2026-10-29 真机(master-b9ba5a689)uptime 行为中文「服务器运行时间」,无 `Uptime:` 英文行;解析已加中英文回退(`status/parse.ts`,单测覆盖),登录队列真机无输出→前台 N/A;在线数走 characters 库 `online=1` 计数不走文本解析(契约 specs/003 contracts/server-status.md)
- [x] characters 今日新注册口径核对:2026-10-29 真机列为 `creation_date TIMESTAMP`(非 `create_date` unix 秒);模型/fixture/集成夹具已对齐,比较改用 Date(T043 偏差注记,原推断不成立)
- [ ] 内容迁移正式跑清单:**已并入 §4 的迁移链**(`pnpm migrate:rehearse --yes --with-media`),
      链内顺序 `media-cos → content → forum → route-map-m3 → route-map-m4 → guide-pages`。
      其中 `media-cos` 必须**先于** content/forum(正文图片 URL 在导入时按 `image_asset_map`
      重写且带 `NOT EXISTS` 守卫,映射表空则旧 URL 永久落库);
      `route-map-m3` 必须**晚于** forum(⑤⑥ 两键读 `forum_thread`/`forum_board`)。
      链末对账须全零:viewsDiffRows=0 / deadlinks=0

## 8. M4 防滥用/统计/备份前置项(T037 扩)

- [ ] 页面访问采集上线核对(替代已下线的 Umami):自建采集无外部服务接线,需确认 `page_view_event` 表已随 `prisma migrate deploy` 建好、前台 beacon 正常上报(`/api/track/pageview` 200)、看板「页面访问」区块有数据;公网反向代理须放行 `POST /api/track/pageview`(SC-306)
- [ ] 人机校验公网切换步骤:后台 `/admin/settings`「人机验证」组填四件套(`CaptchaAppId`/`AppSecretKey` 取自腾讯云验证码控制台,`SecretId`/`SecretKey` 取自腾讯云访问管理 API 密钥)后勾选启用并保存(保存即热生效);腾讯云**无官方测试密钥**,真票据通过路径需在测试环境用真密钥人工联调(`pnpm test:e2e:captcha` 只覆盖控件渲染与无票据 422);登录限速随 Redis 自动生效(默认 5 次/900s 窗口,锁 900s,`config.ts` 可调),公网放开前确认两防均已开
- [ ] 备份 crontab 挂载:`BACKUP_MYSQL_CONTAINER` 改生产业务 MySQL 容器名后挂宿主 crontab(每日 03:30,周日自动追加游戏四库;命令与日志口径见 docs/ops/backup-restore.md §3);首周人工核验 COS 对象产物并做一次恢复演练
- [ ] 游戏库 dump 客户端路径确认:mysqldump 在业务 MySQL 容器内经 `docker exec` 执行(宿主零依赖),确认生产容器名与容器内 client 可用;`gamedb.*` 连接串账号需 SELECT+LOCK TABLES 权限(`--single-transaction` 一致性快照口径)
- [ ] route-map-m4.sql 切换日执行位次:六工具页六键(page_id 537/1287/1699/1880/1897/4371)INSERT ODKU 幂等,链内已固化在 `route-map-m3` 之后(§4 迁移链第 9 步);执行后 web 容器重启生效(route_map 进程内缓存)
- [ ] 配置变更重启口径:system_config 多数键(captcha/smtp/soap/cos/备份参数)后台保存即热生效(写穿失效);唯 `gamedb.*` 四连接串改库后需 web 容器重启(进程内惰性建连,config.ts 注记)
