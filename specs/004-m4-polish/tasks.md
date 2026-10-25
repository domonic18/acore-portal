# Tasks: M4 完善 — 工具页 + 通知 + 安全横切 + 统计与运维

**Feature**: specs/004-m4-polish | **输入**: [spec.md](./spec.md)（6 US / FR-301~318 / SC-301~309，Q1-Q4 已裁决）· [plan.md](./plan.md) · [research.md](./research.md)（R1-R14）· [data-model.md](./data-model.md) · [contracts/](./contracts/)（api-auth-m4 / api-notification / api-admin-m4 / tools-and-seo）· [quickstart.md](./quickstart.md)（S1-S6）

**Tests 为硬性交付**（宪法 VIII）：每个 US 先写测试（先失败）再实现；`make check`（lint+typecheck+test）全绿为一切前提；E2E 一律走隔离 schema `acore_portal_e2e`（AGENTS.md 约定）。

**裁决口径速查**：Q1 全局搜索取消 · Q2 RAF/评论/SEO 工具后置二期 · Q3 统计源 Umami 自托管 · Q4 cron 备份属 M4。安全横切（US2）为 launch-checklist 公网前硬性项，**MVP 首增量 = Foundational + US2（T001-T013）**。

## 文件路径约定（M1-M3 单体延续）

- 页面 `src/app/`；API Route Handlers 薄层；站点组件 `src/components/site/`；表单 client 组件随页
- 服务层 `src/server/services/{notification,stats,settings}/` 新三域；账本挂钩 `src/server/services/points/ledger.ts`
- 通道封装 `src/lib/{turnstile,umami}.ts`；配置 `src/lib/config.ts` 扩组；Redis 助手 `src/lib/redis/rate-limit.ts` 扩展
- 常量 `src/constants/{tools,mail,audit,navigation}.ts`；schema `prisma/schema-business/`；脚本 `scripts/{migrate,cron}/`；运维文档 `docs/ops/`

---

## Phase 1: Setup（环境与基线）

- [x] T001 确认 `004-m4-polish` 基线全绿：`make check`（lint+typecheck+224 vitest）+ E2E 隔离 schema 60/60；清点 E2E fixture 满足 M4 需要（商品/文章/用户既有 fixtures 即够，缺再补）
- [x] T002 常量层扩展：新建 `src/constants/tools.ts`（RANK_BASE/DKP_URL/六页 meta 契约表）；`src/constants/mail.ts` 增 `MAIL_TEMPLATE.POINTS_NOTIFY`；`src/constants/audit.ts` 增 `LOGIN_LOCKED`/`SETTINGS_CHANGED`/`SETTINGS_TEST_MAIL` 三动作；navigation.ts 的 m4 占位**保持不动**（US1 接线时摘除）

**Checkpoint**: make check 全绿，tools 契约表有单测断言（六页路由/iframe 目标一致性，SC-301 锚点前置）。

---

## Phase 2: Foundational（阻塞全部 US）

- [x] T003 配置面扩展：`src/lib/config.ts` schema 扩 5 组——`turnstile`（optional，enabled=true 时 siteKey/secretKey superRefine 必填）/`security`（默认 5/900/900）/`notify`（默认 threshold 0）/`umami`（optional 五键）/`backup`（optional retentionDays 30/gameWeekly true）；flattenToSchema 映射同步；单测：键全缺省可启动/带默认组取默认/optional 组为 undefined
- [x] T004 notification 表迁移：`prisma/schema-business` 增 Notification 模型（data-model §1，双索引+User 反向关系）；`prisma migrate dev`；E2E 隔离库 db:deploy 验证
- [x] T005 Redis 锁助手扩展：`src/lib/redis/rate-limit.ts` 增 `checkLock(key)`/`setLock(key, ttlSec)`/`clearKeys(keys)`；单测：锁内拒绝/TTL 到期恢复/清除生效
- [x] T006 [P] test compose 增 umami 服务：`docker/docker-compose.test.yml` 增 `umami`（ghcr.io/umami-software/umami:latest，DATABASE_URL 指 mysql 容器 umami schema，127.0.0.1:3001）；initdb SQL 增 umami schema+独立账号授权；`up -d umami` 起服验证登录页可达（首启自跑迁移）
- [x] T007 [P] lib/turnstile.ts：siteverify fetch 封装（form-encoded secret+response+remoteip；enabled=false 快速直通；网络异常按失败处理不抛未捕获）；单测 mock fetch：成功/失败/网络异常三态
- [x] T008 [P] lib/umami.ts：API client（login 取 token→Redis `umami:token` 30min 缓存；stats/metrics 查询；未配置组返回 configured:false）；单测 mock fetch：token 缓存命中/过期重取/查询失败容错

**Checkpoint**: 迁移可重放；config 5 组单测绿；umami 容器可起；两通道封装就位。US2 依赖 T003/T005/T007，US3 依赖 T004，US4 依赖 T006/T008，US5 依赖 T003。

---

## Phase 3: US2 — 防滥用横切（P0 硬性项，MVP 首增量）

**目标**: FR-304~307 · SC-302/303 · quickstart S2。

**Tests（先写先失败）**:

- [x] T009 集成：`tests/integration/auth-m4.test.ts` — turnstile 关=直通；开+无 token=422；恒失败密钥=422；连错 N 次第 N+1 次 429 RATE_LIMITED 且锁键存在；锁期内再试 429 LOGIN_LOCKED（retryAfterSec>0）；窗口过期恢复；不存在用户名同样计数锁定且 401/429 文案与真实用户逐字一致；Turnstile 失败不计失败计数；审计 LOGIN_LOCKED 落行且无密码字段
- [x] T010 登录守卫服务：`src/server/services/auth/login-guard.ts` — `assertNotLocked(username, ip)`（锁键前置检查）/`recordFailure(username, ip, config)`（双维 INCR——ip 维仅 XFF 存在时写；达阈值 setLock+writeAudit）/`clearOnSuccess(username, ip)`；security.* 三参从 config 读
- [x] T011 login/register 路由接线：两路由 schema 增 `turnstileToken`；前置顺序=锁检查→turnstile siteverify（422 不计失败）→凭据→失败计数→429（RATE_LIMITED/LOGIN_LOCKED 附 retryAfterSec）；成功清计数；统一文案保持（FR-307）
- [x] T012 Turnstile 前端：登录/注册页（RSC）读 config 下发 `{turnstileEnabled, turnstileSiteKey}`；表单 client 组件 useEffect 渲染 widget（next/script afterInteractive 引 api.js；expired-callback 自动 reset；卸载 remove 防泄漏）；token 随提交体；enabled=false 完全不渲染
- [x] T013 E2E：默认关态登录直通回归（无 widget 节点）；置测试密钥（1x…AA）登录成功含 widget 渲染断言（E2E 走真实 Redis+config，锁定主断言在集成层）

**Checkpoint**: quickstart S2 全过；429/422 错误码语义与契约一致。

---

## Phase 4: US3 — 通知域（核心功能面）

**目标**: FR-308~311 · SC-304/305 · quickstart S3。

**Tests（先写先失败）**:

- [x] T014 集成：`tests/integration/notification.test.ts` — 五类账本事件（注册奖励/徽章/购买扣分/退款/手调）各产生通知行（收件人/类型/金额文案/余额快照正确）；余额不足 402 失败后 notification 计数不变（事务性 SC-304 锚）；阈值邮件：threshold=10 时 +50 手调出 POINTS_NOTIFY 邮件行、threshold=100 不出、0 关闭；unread/markRead/游标分页稳定性；越权读他人通知 404
- [x] T015 通知服务：`src/server/services/notification/{notify,inbox}.ts` — `notifyPointsChange(tx, {userId, delta, balanceAfter, type, refNote})`（INSERT + 阈值判断 + enqueueMail）；`listInbox(userId, cursor)` / `unreadCount(userId)` / `markRead(userId, ids|all)`（全部 where userId 本人）
- [x] T016 账本挂钩：`services/points/ledger.ts` 的 `creditLedgerDetailed`/`debitLedger` 内调 notifyPointsChange（同 tx；标题用 POINT_TX_TYPE_LABEL+delta 组装，linkUrl=/account/points）；回归：M1/M2 既有账本测试全绿（通知为新增副作用断言补充）
- [x] T017 邮件模板：`constants/mail.ts` renderMail 增 POINTS_NOTIFY case（payload {username, delta, balance, reason}，无一次性链接）；单测渲染快照
- [x] T018 API 三路由：`/api/account/notifications/{unread,list,read}`（requireSession；契约 api-notification 逐字段）
- [x] T019 收件箱与弹泡：`/account/notifications` RSC 分页页（+用户中心 ACCOUNT_NAV 通知项）；header 挂未读徽标 client 组件（60s 轮询 unread，增量弹 toast 点击跳收件箱，失败静默）
- [x] T020 E2E：注册→收件箱见注册奖励通知→全部已读→徽标清零；手调积分→轮询徽标出现

**Checkpoint**: quickstart S3 全过；账本回归零破坏（宪法 III）。

---

## Phase 5: US1 — 工具页六页（可与 Phase 3/4 并行，域独立）

**目标**: FR-301~303 · SC-301 · quickstart S1。

- [x] T021 [P] tools-iframe 组件：`src/components/site/tools-iframe.tsx`（撑满视口+title 无障碍+常驻新窗口外链+12s onLoad 超时降级卡「工具服务暂不可用」+外链出口）
- [x] T022 六页薄壳与导航接线：`src/app/{online,online-players,playermap,hardcore,banlist,dkp}/page.tsx`（metadata+iframe）；`navigation.ts` 摘 m4 标记填真 href（公告▾封号记录→/banlist；数据库▾英雄榜→/hardcore、在线玩家→/online-players、在线地图→/playermap、DKP查询→/dkp；在线查询不进导航）；navigation 单测更新（SC-205 回归+新 href 断言）
- [x] T023 route_map m4 补键：`scripts/migrate/route-map-m4.sql` 六行 no-op ODKU（契约表 537/1287/1699/1880/1897/4371）；test/dev 库执行+幂等重跑验证；集成：legacy-redirect 六键 301 断言
- [x] T024 E2E：`tests/e2e/tools.spec.ts` — 六页 200+iframe src 契约断言+外链按钮存在+菜单逐项可达+旧 page_id 301 六键（合并 S1）

**Checkpoint**: quickstart S1 全过；M3 遗留 6 个 404 清零。

---

## Phase 6: US4 — 统计看板（依赖 Phase 2 umami）

**目标**: FR-312~314 · SC-306 · quickstart S4。

- [x] T025 404 采集：全局 `app/not-found.tsx`（保持现有样式+client beacon 组件 fetch keepalive POST /api/track/not-found {path}）；`/api/track/not-found` 路由（path 截断 256/仅相对路径/HINCRBY stats:404:{yyyyMMdd} EXPIRE 48h/IP 轻限速 30 次/分/不记 UA referer）；单测：键面与 TTL/非法 path 拒绝
- [x] T026 Umami 注入与看板服务：app/layout.tsx 条件注入 Script（umami 组存在才渲染）；`src/server/services/stats/dashboard.ts` 聚合五区块（在线复用 getServerStatus/阅读 top10/404 近 7 日 HGETALL 合并 top10/近 7 天订单数+积分消耗 SUM(shop_payment 负流)/新注册 7 天；umami 区块走 lib/umami 独立容错）；集成：mock redis+umami client 断言各区块形状与容错（umami 挂→仅区块 error）
- [x] T027 看板页：`/admin/stats` RSC（requireAdmin+五区块+手动刷新按钮+Umami 区块独立「暂不可用」态）；ADMIN_NAV 增「看板」；E2E：权限口径（edge 拦回 login?next=）+404 beacon 落键→看板区块出现路径+umami 未配置态整页 200
- [x] T028 Umami 联调（test 栈手动，quickstart S4.1-S4.2）：建 website→system_config 补五键→浏览站内→Umami 后台 PV 增长→看板 umami 区块有数；记录 websiteId 配置值入 test 库

**Checkpoint**: quickstart S4 全过；隐私边界（404 无身份）有断言。

---

## Phase 7: US5 — 系统设置与备份（依赖 Phase 2 config）

**目标**: FR-315~317 · SC-307/308 · quickstart S5。

**Tests（先写先失败）**:

- [x] T029 集成：`tests/integration/settings.test.ts` — GET 返回掩码态（passwordConfigured 布尔，无明文）；PUT 非法组 422/组内 zod 422/turnstile enabled 无密钥 422；敏感字段空输入=保持原值、非空=覆写；保存后 reloadSystemConfig 生效（getTransporter 指纹重建）；审计 SETTINGS_CHANGED 无值落盘；test-mail 成功/失败两态（mock transporter）
- [x] T030 设置服务：`src/server/services/settings/{view,save}.ts` — getSettingsView（五组+掩码态）/saveSettingsGroup（组 zod→upsert→reload→审计）/sendTestMail（直发不入 outbox+审计 SETTINGS_TEST_MAIL）
- [x] T031 设置 API 三路由：GET/PUT /api/admin/settings + POST /api/admin/settings/test-mail（requireApiAdmin；契约 api-admin-m4）
- [x] T032 设置页：`/admin/settings` RSC（五组表单+掩码交互：已配置显「••••••（已配置，留空保持）」+测试发信卡片 to 输入+结果提示）；ADMIN_NAV 增「设置」；E2E：页面可达+掩码态渲染+测试发信到 Mailpit（S5.2-S5.3 简版自动化，主链路集成层）。（偏差注记：敏感字段保存成功后须清空组件 state 再 router.refresh——否则重渲染把内存 state 写回 DOM value,掩码红线被 E2E 抓包）
- [x] T033 备份脚本：`scripts/cron/backup.mjs`（.env 引导+system_config 取 cos.*/backup.*；docker exec mysqldump 业务库→gzip→COS backups/db/{name}-{yyyyMMdd}.sql.gz→retention 清理；--force-weekly 调试参数触发游戏四库 dump；凭据零打印）；test 栈真实跑一次冒烟（S5.4）
- [x] T034 运维文档：`docs/ops/backup-restore.md`（备份范围/恢复步骤/crontab 示例/游戏库 dump 两种客户端路径/配置变更重启口径）；**恢复演练执行并尾注记录**（临时 schema 导入+行数核对+冒烟，SC-308）

**Checkpoint**: quickstart S5 全过；SC-308 演练留痕。

---

## Phase 8: US6 — SEO sitemap/robots

**目标**: FR-318 · SC-309 · quickstart S6。

- [x] T035 sitemap 与 robots：`app/sitemap.ts`（覆盖口径照契约 tools-and-seo：固定路由+文章 publish+商品 published+版块+未关闭主题上限 5000+六工具页；base=config app.url）；`app/robots.ts`（五条 Disallow+Sitemap 行）；单测：条目数与库 count 对账（draft/listed=0 排除断言）
- [x] T036 E2E：sitemap.xml/robots.txt 可达+关键条目断言（并入 tools.spec 或独立 seo.spec）；404 页面渲染回归（not-found 样式）

**Checkpoint**: quickstart S6 全过；M3 FR-213 遗留收口。

---

## Phase 9: Polish 与收口

- [x] T037 launch-checklist 增补 M4 节：Umami 生产接线（容器+域名+websiteId）/公网 Turnstile 真密钥切换步骤/备份 crontab 挂载/游戏库 dump 客户端路径确认/route-map-m4.sql 切换日执行位次/配置变更重启口径
- [x] T038 性能快测：收件箱分页/看板聚合 P95 记录（perf-profile 惯例，脚本用后即清）；404 beacon P95（结果记 specs/004-m4-polish/perf-profile.md：P95 19.0/37.7/6.9ms，脚本已删）
- [x] T039 静态安全核查：密钥掩码 grep（settings 服务/日志/审计零明文）；404 无身份字段；backup.mjs 凭据零打印；Turnstile secretKey 无前端泄漏面（四项全过零改动：view 只回掩码布尔/审计摘要 replaceAll 脱敏/beacon 仅相对 path/secrets 数组 redact/secretKey 只写不读）
- [x] T040 文档三层同步：AGENTS.md（测试计数/新增域 notification/stats/settings/tools 常量）/README/development-plan M4→「开发完成(验收顺延)」/飞书池 M4 8 条流转+里程碑表状态（AGENTS+README×2+development-plan 已同步;飞书池按 M1/M2/M3 先例「开发完成(验收顺延)不翻条目状态」）
- [x] T041 SC 核销表：`specs/004-m4-polish/checklists/sc-acceptance.md`（SC-301~309 逐条对用例/演练/文档，M3 先例）
- [x] T042 Final Checkpoint：`make check` 全绿 + E2E 隔离 schema 全量；spec/plan/tasks/quickstart 复核勾选；development-plan 变更记录（make check 292/292 + E2E 关态 79/2 全绿[admin-content 预览一次水合抖动瞬态,单跑+全量复跑全绿,与 run8→run9 先例同指纹];开态档 79/2 于 US6 后同代码态全绿;plan/quickstart 无勾选框,SC 对齐见核销表）

---

## 并行与依赖总览

- **MVP 首增量**：Phase 1+2+3（T001-T013，安全横切公网硬性项先行）
- **[P] 并行点**：T006/T007/T008（Phase 2 内三件互不依赖）；US1（Phase 5）与 US2/US3 文件零交集可全程并行；US6（Phase 8）独立
- **串行链**：T003→T010/T011（config→守卫）；T004→T014-T016（表→通知）；T006/T008→T026-T028（umami→看板）；T003→T029-T032（config→设置）
- 验收锚点分布：SC-301(T022-T024) · SC-302/303(T009-T013) · SC-304/305(T014-T020) · SC-306(T025-T028) · SC-307(T029-T032) · SC-308(T033-T034) · SC-309(T035-T036)

---

## 偏差与落地注记（实施期实测修正,均为不改变验收语义的实现细节）

- **T006**:umami 镜像钉 `ghcr.io/umami-software/umami:mysql-v2.18.0` 而非 latest——umami v3（Prisma 7）已弃 MySQL,只有 v2 支持;ghcr tag 为 DB 变体+`v` 前缀格式。
- **T010/T011**:register 路由仅做 Turnstile 预检,不做失败计数/锁定——注册无凭据猜测面,锁定语义只适用于 login(T011 原文两路由并列表述,按语义拆分)。
- **T012**:widget 渲染不依赖 next/script onLoad(dev React StrictMode 双挂载下可能不触发),改为轮询 `window.turnstile`;测试站点键 1x…AA 为隐形自动通过模式,E2E 断言锚 `cf-turnstile-response` 隐藏域而非挑战 iframe;开态下表单在 token 就绪前禁用提交(防 token 竞态 422)。
- **T013**:login.spec 错误密码用例改用不存在用户名——共享 Redis 上 IP/用户名维计数键持久跨运行,避免对真实 seed 账号累计失败触发意外锁定(真实/不存在用户文案一致性由集成层逐字断言);集成测试 IP 段掺 RUN 同理。
- **T008/T017**:renderMail 的 POINTS_NOTIFY case 随 T008 提前实现(向 MAIL_TEMPLATE 加枚举后 switch 穷尽性 typecheck 要求,提前不改变 US3 验收)。
- **T014/T016**:越权防御落地口径=无跨用户寻址面——三路由全按会话 userId 过滤、无 per-id 读取端点,他人 id 已读零生效(marked=0 不报错,防枚举);契约「读他人 404」语义由此覆盖。账本挂钩引入新副作用面:register 补偿链 purgeSiteUser 同步回收 notification(否则游戏端失败补偿删 user 撞 FK),7 个既有测试清理链同补 notification.deleteMany。
- **T019**:徽标 60s 轮询外补 `ap:unread-changed` window 事件旁路——收件箱页单条/全部已读后徽标即时刷新(否则已读后数字滞留到下个轮询周期);E2E 手调弹泡用 page.clock 快进 60s 触发轮询(server-status 先例),弹泡只对轮询增量弹、mount 基线不弹。
- **T020**:阈值邮件 S3.5 的「Mailpit 可视」走集成层 outbox 行断言(收件人/模板/payload 逐字段),未再起浏览器验 Mailpit UI——链路同一,outbox 行即可视源头。
- **T023**:route-map-m4.sql 已在 dev 库执行并幂等重跑验证(page_id 计 13+6=19);3308 测试栈**部署 US1 代码后再执行**——新代码未上前 301 会把旧链引到 404 薄壳,反而劣化;集成断言用 beforeAll upsert 六真键自愈,不依赖手动执行 SQL。E2E 六键播种并入 global-setup(照 p:999 先例,webServer 启动前落库使进程内 route 缓存可见),teardown 对应清理。
- **T024**:framework.spec 公告▾用例的「封号记录占位/即将开放」断言同步改为真链路断言(m4 占位随 T022 摘除);tools E2E 六键 301 用例带 route 缓存陈旧跳过保护(同 route-compat 先例)。
- **T023(补)**:3308 测试栈 route-map-m4.sql 已于 2026-10-25 随 US4 代码部署执行,`?page_id=537→/banlist` 等 301 六键对账通过。
- **T025/T026**:集成测试直连 dev redis/MySQL 真实依赖(未 mock)——redis 键 RUN 后缀隔离+用后 hdel,五区块用基线差值法(dev 库有存量 7 日内数据),articleTop fixture 用极大阅读数保证进榜断言稳定;umami 两态经 system_config 行+reloadSystemConfig 切换。
- **T026**:layout 注入带 catch 容错——build 期(Dockerfile 假 DATABASE_URL 预渲染 /_not-found 等)取不到配置时静默跳过,不阻塞渲染;运行期配置由 instrumentation 预热。
- **T026/T028**:test 栈联调发现 lib/umami 误用单数字段——真实 umami v2 `/stats` 返回 `pageviews`/`visitors`(复数),单数恒空致 PV/UV 恒 0,已修(acfee57)。
- **T028**:联调结果=test 栈 websiteId `45e35aaa-fe41-4886-825c-8bb6275e7110` 已写入 3308 system_config;apiUrl 用 compose 服务 DNS `http://umami:3000/api`(web 容器视角)、scriptUrl 用宿主映射 `http://127.0.0.1:3001/script.js`(浏览器视角)——生产接线时两者均换公网域名(记 launch-checklist);实测浏览器 3 次访问→umami PV 3→看板区块 PV 7/UV 1,采集链路与拉数链路双通。
- **已知 flake**:dev server 冷启动首编译 `/api/admin/markdown-preview`(markdown 重依赖链)偶超 10s,admin-content.spec 预览/草稿两用例顺序依赖偶发假警;同代码独立跑×3 与冷启动全量复跑均全绿,非产品缺陷。
