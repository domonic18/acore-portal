# Feature Specification: M4 完善 — 工具页 + 通知 + 安全横切 + 统计与运维

**Feature Branch**: `004-m4-polish`

**Created**: 2026-10-25

**Status**: Clarified（2026-10-25 用户裁决：Q1-Q4 全部按建议项落定，见 §7）

**Input**: 飞书需求池 M4-完善 15 条（11 待开发 / 4 已取消；RAF/文章评论/SEO 工具裁决后置 → 有效 8 条）+ 规格 §9/§10/§11/§12/§13 + M3 迁移报告「M4 功能面 6 页补键」+ 原型 p05/p06/p10/p15 + launch-checklist §6（Turnstile+限速公网前硬性）

## User Scenarios & Testing *(mandatory)*

### US1 工具页六页（iframe 集成，P1；DKP P2）

rank.lokta.cn 独立 armory 应用**短期不整合**（D5 维持 iframe 方案，整合在二期后置池）：

- **五页 iframe**（rank.lokta.cn 原样嵌入）：在线查询（→/ranking）、在线玩家（→/online）、在线地图（→/playermap）、英雄榜/硬核挑战（→/hardcore）、封号记录（→/banlist）
- **DKP 查询页**：webdkp.nfuwow.com 外部第三方，iframe + 显式外链按钮
- 每页提供「新窗口打开」外链；iframe 加载失败给降级提示与外链出口
- **route_map 补键**（M3 迁移报告遗留，6 个旧 page_id 现直落 404）：537→封号记录、1287→在线查询、1699→DKP、1880→英雄榜、1897→在线玩家、4371→在线地图
- 全局导航「数据库▾」下拉组链接从外链/死链改指站内六页

### US2 防滥用横切（Turnstile P2 + 登录限速 P1）

launch-checklist §6 硬性项——公网放开前必须落地：

- **Turnstile 人机验证**：登录 + 注册表单嵌入 Cloudflare Turnstile widget，服务端 siteverify 校验，失败拒绝
- 开关与密钥走 system_config（`turnstile.enabled/siteKey/secretKey`）；`enabled=false` 直通（开发/测试环境默认关）；切换公网真密钥**只改配置零代码**
- 开发期使用 Cloudflare 官方测试密钥（永远通过），不阻塞流水线
- **登录限速 + 失败锁定**：按 IP + 账号双维度计数（Redis 滑动窗口）；连续失败 N 次锁定一段时间；锁定与限速阈值可配；触发写审计
- 错误提示保持 M1 防枚举口径（不区分账号不存在/密码错误）

### US3 通知域（积分通知 P1 + 通知中心 P2）

现状仅积分到账弹泡无收件箱；新系统建通知中心（站内信）：

- **notification 模型**（站内信）：收件人/类型/标题/正文/跳转链接/已读时间
- **积分事件全挂站内信**：注册奖励、徽章授予、购买扣分、退款回补、管理员手调——与账本写入同事务落通知
- **通知中心收件箱**（/account/notifications）：列表分页 + 未读徽标（导航处）+ 单条/全部已读
- **弹泡**：登录态轮询未读，新增未读弹 toast，点击跳收件箱
- **邮件阈值通知**：积分变动绝对值达阈值（system_config 可配）发邮件，走 M1 mail_outbox 通道
- 后台群发/定时通知不在 M4（原型 p12 属后续；YAGNI）

### US4 统计看板（P1）

数据源二分（D4 已裁：WP Statistics 28.9 万 UV 历史归档不迁）：

- **Umami 自托管**承接流量指标（UV/PV/来源/搜索词）：compose 增服务 + 独立库 schema；全站 layout 注入 tracking script（site id 走 system_config）
- **库内指标**自建：今日在线（复用 M3 status 探针）、文章阅读 top、404 路径 top、近 7 天订单数/积分消耗、新注册数
- **404 采集**：全局 not-found 页上报 → Redis 日键计数（轻量，不引新服务）
- 后台看板页 /admin/stats（requireAdmin）：流量区块 + 库内指标区块同屏

### US5 系统设置与备份（P1）

- **SMTP 配置页**（/admin/settings）：smtp.* 组查看/编辑（密码掩码展示）+ 保存热生效（reloadSystemConfig 先例）+ 测试发信按钮
- 同页容纳 Turnstile 组与邮件阈值组配置（system_config 全部走库，宪法 VI）
- **服务器 cron 备份**：业务库每日 mysqldump → gzip → 上传 COS（私有读），保留期可配；游戏四库每周备份开关默认开；恢复文档 + test 栈恢复演练
- 备份凭据不落仓库（COS 密钥已入 system_config，脚本从库/env 引导凭据读取）

### US6 SEO sitemap/robots（development-plan M4 目标行）

- **/sitemap.xml**：首页、三归档、文章全量（publish）、静态页、商品（published）、版块、未关闭主题
- **/robots.txt**：Sitemap 引用；Disallow /admin、/account、/api、/cart、/checkout
- M3 FR-213 的「sitemap 生成」遗留项在此收口

## Requirements *(mandatory)*

### Functional Requirements

**工具页**
- **FR-301**：六工具页路由可达（在线查询/在线玩家/在线地图/英雄榜/封号记录/DKP），iframe 目标 URL 常量收口；每页带新窗口外链与加载失败降级出口
- **FR-302**：route_map 补键 6 条（page_id 537/1287/1699/1880/1897/4371），301 生效且幂等可重跑
- **FR-303**：全局导航「数据库▾」六项指向站内路由（不再外链直跳）

**防滥用**
- **FR-304**：Turnstile 开关关闭时登录/注册直通；开启时无 token/校验失败一律拒绝并返回表单错误
- **FR-305**：Turnstile siteKey/secretKey/enabled 走 system_config，密钥后台页掩码展示，前端 siteKey 由服务端下发
- **FR-306**：登录失败按 IP+账号双维滑动窗口计数；达阈值锁定锁定期内拒绝；阈值/时长 system_config 可配；锁定与解锁写审计
- **FR-307**：限速/锁定错误提示不泄露账号存在性（沿用 M1 防枚举口径）

**通知域**
- **FR-308**：notification 模型与收件箱页；列表分页、未读徽标、单条/全部已读
- **FR-309**：五类积分事件（注册奖励/徽章/购买/退款/手调）与账本写入同事务产生站内信，账本回滚则通知不残留
- **FR-310**：登录态前端轮询未读数，新增未读弹泡提示
- **FR-311**：积分变动绝对值达阈值（system_config 可配，0=不发）触发邮件走 mail_outbox，重试/审计沿用 M1 机制

**统计看板**
- **FR-312**：Umami tracking script 全站注入，websiteId/scriptUrl 走 system_config，未配置不注入
- **FR-313**：/admin/stats 聚合 Umami 流量指标与库内指标（在线/阅读 top/404 top/近 7 天订单与积分消耗/新注册）；requireAdmin 守卫
- **FR-314**：404 路径计数落 Redis 日键（含 path 维度），仅记录路径不记录访问者身份

**系统设置与备份**
- **FR-315**：/admin/settings 分组管理 smtp/turnstile/notify 配置；保存写审计+热生效；SMTP 密码掩码展示可覆写
- **FR-316**：测试发信按钮：向指定邮箱发一封测试邮件，成功/失败在页面可见
- **FR-317**：备份脚本幂等按日命名，业务库每日+游戏四库每周（可关），上传 COS 私有读，保留期自动清理；恢复文档随仓

**SEO**
- **FR-318**：/sitemap.xml 覆盖 US6 全量口径；/robots.txt 引用 sitemap 并屏蔽私有路径

### 关键数据面

| 域 | 面 | 去向 |
|---|---|---|
| 旧 page_id | 537/1287/1699/1880/1897/4371 | route_map 补键 → 六工具页 |
| 积分事件 | 五类（M1/M2 已有写入点） | notification 站内信 + 阈值邮件 |
| 流量统计 | Umami 自托管（新容器+独立 schema） | /admin/stats 流量区块 |
| 404 | not-found 上报 | Redis 日键 |
| 备份 | 业务库 daily + 游戏四库 weekly | COS（私有读） |
| sitemap | 文章 110/商品 61/版块 5/静态页 4 + 主题 | /sitemap.xml |

## Success Criteria *(mandatory)*

- **SC-301**: 六工具页路由可达且 iframe 目标正确；6 个旧 page_id 301 全部生效；「数据库▾」菜单逐项可点通
- **SC-302**: Turnstile 关=直通；开=无 token 拒绝；siteKey 换真密钥仅改 system_config 零代码改动
- **SC-303**: 连续失败达阈值触发锁定，锁定期内拒绝、期满恢复；审计留痕可查
- **SC-304**: 五类积分事件全部产生站内信且与账本同事务（回滚不残留）；收件箱已读流转与未读徽标准确
- **SC-305**: 达阈值积分变动触发邮件（mail_outbox 可见），未达不发；阈值修改即时生效
- **SC-306**: Umami 采集运行（PV 上报可达）；看板页流量与库内指标渲染正确、库内数值与库对得上
- **SC-307**: SMTP 配置页修改保存后测试发信到达（test 栈 Mailpit）；变更留审计
- **SC-308**: 备份脚本产出物在 test 栈完整恢复演练成功（空库导入+核心页冒烟）
- **SC-309**: sitemap.xml/robots.txt 可达，覆盖量与库核对一致

## 适用宪法原则（合规映射）

- **原则 IV 兼容无感**：FR-302 六键补齐 M3 遗留 404，SC-301 对应
- **原则 V 数据边界**：rank iframe 不触游戏库；Umami 独立 schema；404 仅记路径不记身份；备份只读业务库（游戏库 dump 走各自连接只读）
- **原则 VI 安全纵深**：US2 是本里程碑核心（宪法 VI deferral 到期清账）；SMTP/COS 密钥掩码+入库；备份制品私有读
- **原则 VII 单体 YAGNI**：不做后台群发通知、不做消息推送、不自建 BI；搜索已取消（Q1）
- **原则 VIII 测试必附**：SC-301~305/307/309 全自动化锚点；SC-306 部署断言+指标冒烟；SC-308 演练文档化

## Assumptions

- rank.lokta.cn 不整合进新栈（D5 维持 iframe；整合在二期后置池）；DKP 外部第三方仅 iframe+外链
- 全局搜索**已取消**（2026-10-25 Q1 裁决，飞书池已取消为准）；RAF 招募/文章评论/SEO 工具后置二期（Q2）
- 统计流量源定 **Umami 自托管**（Q3）；WP Statistics 历史数据归档不迁（D4 既定）
- 服务器 cron 备份**属 M4 交付**（Q4），验收=SC-308 恢复演练
- Turnstile 开发期用 Cloudflare 官方测试密钥；公网真密钥仅 system_config 配置（launch-checklist 前置项收口点）
- admin 群发/定时通知（原型 p12 通知页）不在 M4；M1 mail_outbox 与 lib/cos、lib/config 底座直接复用不重建
- 会话安全（§13）M1 已覆盖（JWT+Redis 可吊销+refresh 轮换），M4 不重复建设

## 澄清决策记录（2026-10-25 用户裁决归档）

| # | 问题 | 裁决 | 备注 |
|---|---|---|---|
| Q1 | 全局搜索取舍（飞书池已取消 vs development-plan M4 目标仍含） | **A. 确认取消**（池为准） | 同步修订 development-plan 与里程碑表 M4 目标行；规格 §10 搜索章节随之作废 |
| Q2 | 三条 P2 边缘项（RAF 招募/文章评论/SEO 工具） | **A. 全部后置二期** | RAF 依赖游戏端 Eluna 未落地；评论防滥用栈先行；SEO 工具上线前再评估（sitemap/robots 不受影响属 M4） |
| Q3 | 统计看板数据源 | **A. Umami 自托管** | 原型 p10 标注方案；多跑一容器+独立 schema，UV/PV/来源/搜索词开箱即得 |
| Q4 | 服务器 cron 备份是否属 M4 | **A. 属 M4** | 上线前正好需要；验收=恢复演练（SC-308） |
