# M4 SC-301~309 核销表(T041)

> 原则 VIII:每条 SC 必须有自动化锚点。本表记录各 SC 的锚点与核销状态(2026-10-25,M4 收口 T042 前置)。
> 核销口径 = 开发环境(mock SOAP/种子+fixture 数据)全绿;依赖真实密钥/真机通道/生产部署的半项顺延 launch-checklist §8,不阻塞开发收口。

| SC | 锚点(测试/脚本) | 核销状态 |
| --- | --- | --- |
| SC-301 六工具页可达+iframe 正确+6 旧 page_id 301+数据库▾菜单 | `tests/unit/tools.test.ts`(T022:六页 meta 契约表与 route_map-m4.sql/薄壳页四方一致)· `tests/e2e/tools.spec.ts`(T023/T024:六页 200+iframe src+外链按钮;主导航公告▾/数据库▾逐项;旧 page_id 六键 301 逐键) | ✅ 开发环境;rank/webdkp 外部服务可用性不在断言面(公网可通归 launch-checklist §8) |
| SC-302 Turnstile 关=直通/开=无 token 拒绝/真密钥零代码切换 | `tests/unit/turnstile.test.ts`(T009:关态直通/开态缺 token 422)· `tests/integration/auth-m4.test.ts`(开+siteverify 恒失败→422 不计失败;通过→凭据校验)· `tests/e2e/turnstile.spec.ts`(关/开双档渲染+受理,`pnpm test:e2e:turnstile` 开态档) | ✅ 双档 E2E 全绿;真密钥切换=system_config 三键,步骤归 launch-checklist §8 |
| SC-303 连错达阈值锁定/期内拒绝/期满恢复/审计留痕 | `tests/integration/auth-m4.test.ts`(T011:第 6 次 429 RATE_LIMITED+锁键+审计;锁期内 429 LOGIN_LOCKED 不碰凭据;窗口过期与锁到期自然恢复;不存在用户同计数同锁+401/429 文案逐字一致 FR-307)· `tests/e2e/login.spec.ts`(前台锁定路径) | ✅ 全核销 |
| SC-304 五类积分事件站内信+与账本同事务+收件箱已读/徽标 | `tests/integration/notification.test.ts`(T015/T016:notifyPointsChange 同事务回滚不残留/五事件断言/listInbox cursor 分页/markRead 单条+全部/unreadCount)· `tests/e2e/notification.spec.ts`(T020:注册→收件箱→全部已读→徽标清零;手调积分→轮询弹泡) | ✅ 全核销 |
| SC-305 达阈值邮件/未达不发/阈值修改即时生效 | `tests/integration/notification.test.ts`(T015:阈值判断+enqueueMail,mail_outbox 可见)· `tests/integration/settings.test.ts`(T031:notify.pointEmailThreshold 保存+reloadSystemConfig 即时生效)· `tests/e2e/admin-settings.spec.ts`(阈值改动前台生效路径) | ✅ 全核销 |
| SC-306 Umami 采集运行+看板渲染正确+库内数值对得上 | `tests/unit/umami.test.ts`(T006:script 注入/未配置不注入)· `tests/integration/stats.test.ts`(T026:在线数/文章 Top/404 Top/交易流水聚合与库对账)· `tests/e2e/admin-stats.spec.ts`(T027/T028:权限口径 FR-125+404 采集闭环 FR-312 端到端+五区块+手动刷新+umami 未配置降级 SC-306 文案) | ✅ 开发环境;umami 容器生产接线+PV 真实采集归 launch-checklist §8 |
| SC-307 SMTP 配置页保存+测试发信到达+变更审计 | `tests/integration/settings.test.ts`(T030/T031:五组保存/敏感字段只写不读/坏 SMTP 热生效失败可见)· `tests/e2e/admin-settings.spec.ts`(T032:保存后测试发信 Mailpit 到达+SETTINGS_* 审计+掩码红线 page.content() 无明文) | ✅ 全核销(test 栈 Mailpit 口径) |
| SC-308 备份产出物完整恢复演练 | `scripts/cron/backup.mjs`(T033:业务日备+游戏四库周备+保留期清理+凭据 redact)· `docs/ops/backup-restore.md`(T034:范围/运行/crontab/恢复四节,§4 空库导入步骤文档化) | ✅ 演练文档化;COS 真实上传+空库导入+核心页冒烟的完整演练归 launch-checklist §8(首周核验项) |
| SC-309 sitemap.xml/robots.txt 可达+覆盖量与库核对 | `tests/integration/sitemap.test.ts`(T035:post/shop/board/thread 四域条目数与库 count 对账;draft/listed=0/关闭/软删排除断言;固定路由 18 条恰好一次)· `tests/e2e/seo.spec.ts`(T036:robots.txt 五 Disallow+Sitemap 逐行;sitemap.xml 固定+动态+lastmod+排除项;404 页渲染回归) | ✅ 全核销 |
