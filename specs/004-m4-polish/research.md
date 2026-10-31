# Research & Decision Log: M4 完善

**Branch**: `004-m4-polish` | **Date**: 2026-10-25 | 输入: spec.md（Q1-Q4 已裁决）+ plan.md 宪法门禁

> 决议编号 R1-R14；每条含**结论**与**依据**。既有底座事实以代码为准（摸底记录见各条）。

## R1 Turnstile 集成模式

**结论**: 官方 api.js 外链脚本 + 手动渲染 widget（零 npm 依赖）；服务端 siteverify POST `https://challenges.cloudflare.com/turnstile/v0/siteverify`（form-encoded: secret + response + remoteip）；前端 token 随登录/注册表单 body 提交，路由层在校验凭据**之前**验证。

- 配置组 `turnstile`（optional，照 cos 先例）：`turnstile.enabled`（默认 false）/`turnstile.siteKey`/`turnstile.secretKey`；enabled=true 时 siteKey/secretKey 必填（zod superRefine）
- 开发期用 Cloudflare 官方测试密钥（sitekey `1x00000000000000000000AA` 永远通过 / `2x00000000000000000000AB` 永远失败 / `3x00000000000000000000FF` 强制交互），测试两态不依赖外网
- siteKey 由服务端下发：登录/注册页为 server 组件读 config 传 props 给表单 client 组件（密钥不出后端：siteKey 本身公开、secretKey 只在服务端）
- widget 渲染：client 组件 `useEffect` 调 `window.turnstile.render(el, {sitekey, callback})`；脚本 `next/script` `strategy="afterInteractive"` 注入；卸载时 `turnstile.remove` 防泄漏
- 失败语义：无 token / siteverify fail / timeout → 表单错误「人机验证未通过，请重试」，HTTP 422 TURNSTILE_FAILED；不消耗登录失败计数（防恶意锁人：先过人机再计凭据失败）

## R2 登录限速与失败锁定

**结论**: Redis 固定窗口计数 + 显式锁键；**账号维度为主、IP 维度仅在可信 XFF 存在时启用**。

- 计数键：`rl:login:fail:u:{username}` / `rl:login:fail:ip:{ip}`（hitRateLimit INCR+EXPIRE 复用）；锁键：`login:lock:u:{username}` / `login:lock:ip:{ip}`（SET EX）
- 流程：①查锁键命中 → 429 `LOGIN_LOCKED` + retryAfterSec（不触凭据校验）②siteverify ③凭据校验 ④失败 → 两计数器 INCR，任一达阈值 → SET 锁键 + 审计 `LOGIN_LOCKED`（记 username 指纹与 ip，不记密码）⑤成功 → 清两计数器与锁键
- 配置组 `security`（带默认值，键缺失不阻塞启动）：`security.loginMaxFails=5` / `security.loginWindowSec=900` / `security.loginLockSec=900`
- **防枚举与防自锁**：计数按「提交的用户名原串」统计（含不存在的用户名——不存在的也被锁，攻击者无法通过锁行为探测账号存在性）；错误文案沿用 M1 统一 401；429 锁定文案同样统一（「尝试过于频繁，请稍后再试」，不区分是账号还是 IP 触发）
- **IP 维度退化**：frp/caddy 链路设 X-Forwarded-For 才计 IP 维度；无 XFF（直连/非可信代理）只按账号计数，防共享出口 IP 全体自锁
- 注册/forgot-password 挂 Turnstile 但**不挂失败锁定**（无凭据试错面；注册防刷由 Turnstile 承担，邮件重发已有限速）

## R3 notification 通道域归属与账本挂钩点

**结论**: 新建 `services/notification/`（通知通道域，与 mail 同层）；在账本两个阻塞点 `creditLedgerDetailed` / `debitLedger` 内**同事务**写站内信。

- 归属依据：auth→mail 先例（enqueueMail 被账号域调用未算域互引）；通知是「通道」而非业务域，消费方（points）→通道单向依赖合法
- 挂钩点收敛在 ledger 层而非 5 个调用方（register/badge/checkout/refund/adjust）：一层挂钩全覆盖未来新增事件；ledger 已持有 tx/amount/type/balanceAfter/refType/refId，通知所需字段齐备
- 通知内容：type=`points`，title=「积分{入账|扣减} {amount}」，body=POINT_TX_TYPE_LABEL + 事件说明 + 余额快照，linkUrl=/account/points
- **事务性即 SC-304 锚**：通知 INSERT 用调用方 tx，账本回滚通知同回滚（集成测试断言：扣分失败抛 LedgerError 后 notification 计数不变）
- 通知失败不阻塞账本？**否**——同事务语义下 INSERT 失败即整体回滚，账本与通知强一致（宪法 III 优先于通知可用性；INSERT 本地行无外部依赖，失败概率等同账本本身）

## R4 阈值邮件与模板

**结论**: 通知服务在写站内信同事务内判断阈值，达阈值 → `enqueueMail(tx, POINTS_NOTIFY)` 入 outbox（drainOutbox 现有机制自动发送）。

- 配置 `notify.pointEmailThreshold`（默认 0=不发；绝对值比较 |amount|≥阈值）
- 新模板 `MAIL_TEMPLATE.POINTS_NOTIFY` + renderMail case：payload {username, delta, balance, reason}；邮件为通知性内容**无一次性链接**（MAIL_PAYLOAD.link 现为必填 → 模板载荷类型需放宽或复用 link=/account/points）
- 注册奖励/徽章授予/购买扣分/退款/手调五类全部经过 R3 挂钩点 → 阈值逻辑单点生效

## R5 Umami 自托管部署与接入

**结论**: Umami v2 官方镜像入 test compose；同 MySQL 实例独立 schema `umami` + 独立账号；全站 layout 条件注入 tracking script；看板服务端调 Umami API 拉数。

- compose 服务：`umami`（image `ghcr.io/umami-software/umami:latest`），DATABASE_URL=mysql://umami:{pw}@mysql:3306/umami，端口 127.0.0.1:3001:3000；Umami v2 启动自跑迁移（Prisma 内建），首启自动注册 website 需手动建（UI 操作一次，websiteId 入配置）
- 配置组 `umami`（optional，未配置=不注入不拉数）：`umami.scriptUrl`（如 http://127.0.0.1:3001/script.js，生产为公网地址）/`umami.websiteId`/`umami.apiUrl`/`umami.apiUsername`/`umami.apiPassword`
- 注入：app/layout.tsx（server）读 config，optional 组存在才渲染 `<Script src data-website-id strategy="afterInteractive">`；**生产/test 域名差异由配置承载，代码零分支**
- 看板拉数：POST {apiUrl}/api/auth/login 取 token（Redis 缓存 `umami:token` 30min）；GET /api/websites/{id}/stats?startAt&endAt → PV/UV；GET /api/websites/{id}/metrics?type=referrer → 来源域 top
- **搜索词降级**：Umami 无搜索关键词报表（搜索引擎普遍不回传 keyword，WP Statistics 时代同为 "(not provided)" 主导）；看板口径=「来源域 top」（搜索引擎占比可见），关键词级统计明确不做
- test 栈 Umami 经宿主端口映射（127.0.0.1:3001）；公网采集链路（frp 转发 script.js+collect API）属上线运维接线，记 launch-checklist，不阻塞开发验收

## R6 404 路径采集

**结论**: 全局 `app/not-found.tsx`（Next 14 支持）内 client beacon `fetch('/api/track/not-found', {keepalive})` → 服务端 Redis `HINCRBY stats:404:{yyyyMMdd} {path}` + EXPIRE 48h。

- **只记 path 不记 UA/IP/referer**（隐私边界，FR-314）；API 无需鉴权但加轻限速（hitRateLimit `rl:404:{ip}` 60s×30，防刷写）
- path 截断 256 字符 + 仅收站内相对路径（拒绝绝对 URL/外域）
- legacy-redirect 未命中 404（裸 404 响应不渲染 not-found 页）不计入——口径=「页面渲染 404」，不含 API/兼容层裸 404（对账简单）

## R7 sitemap/robots 实现

**结论**: Next Metadata 约定文件 `app/sitemap.ts` + `app/robots.ts`；base URL 取 config `app.url`。

- sitemap 覆盖（FR-318 口径）：`/`、三归档（/announcements /news /guides）、/devlog、/progression、/forum、/shop、文章 publish 全量（/post/{slug}，lastModified=updatedAt）、静态页 4、商品 published（/shop/{slug}）、版块（/forum/{board}）、未关闭主题（/forum/thread/{id}，上限 5000 防炸）
- robots：`Sitemap: {app.url}/sitemap.xml`；Disallow：/admin、/account、/api、/cart、/checkout
- draft/deleted/listed=0 一律不进 sitemap；route 对账测试=SC-309（量级与库 count 核对）

## R8 route_map m4 补键与生效

**结论**: `scripts/migrate/route-map-m4.sql` 六行 INSERT no-op ODKU（MySQL 8.4 形态照 M3 先例）；键=page_id:{537→/banlist, 1287→/online, 1699→/dkp, 1880→/hardcore, 1897→/online-players, 4371→/playermap}。

- 工具页路径为固定字面量（无 slug），new_path 无需编码处理
- 生效口径：服务进程内缓存——SQL 直改后 web 容器重启可见（M3 先例，route-map 服务 save/remove 走服务时免重启；脚本跑完重启）；test 栈立即执行，切换日随 launch-checklist 顺序跑
- 幂等：重复执行零新增（ODKU 命中 existing 行）

## R9 /admin/settings 设计

**结论**: 单页分组表单（smtp/turnstile/security/notify/umami 五组）+ 保存热生效 + 测试发信；新建 `services/settings/`。

- 读取：getSettingsView() 按组返回字段 + 敏感字段掩码态（`secretMasked: true` + 是否已配置布尔，**不回显任何密钥明文**）
- 写入：saveSettingsGroup(group, patch, actor)——zod 组校验 → 敏感字段空输入=保持不变、非空=覆写 → system_config upsert → reloadSystemConfig → 审计 `SETTINGS_CHANGED`（只落组名/键名/掩码 diff，不落值）
- SMTP 热生效**零额外工作**：lib/mail getTransporter 按 smtp 配置 JSON 指纹自动重建连接（摸底已确认）
- 测试发信：POST test-mail {to} → getTransporter 直发一封（不入 outbox，不走模板包装用轻量正文）→ {ok} 或 {ok:false, error: 摘要}；审计 `SETTINGS_TEST_MAIL`（记 to 不记凭据）
- Turnstile 组保存后前端下次进登录页取新 siteKey（RSC 动态读 config，无缓存问题）；umami 组保存后 layout 下次渲染生效（RSC 无持久缓存，force-dynamic 页面即时）
- ADMIN_NAV 增「设置」；umami 看板挂「看板」入口

## R10 备份脚本与恢复演练

**结论**: `scripts/cron/backup.mjs`（node，cos-upload.mjs 同款 CLI 形态：.env 引导 + system_config 取 cos.*/backup.* 凭据配置）+ `docs/ops/backup-restore.md`。

- 业务库 dump：`docker exec {MYSQL_CONTAINER} mysqldump ...`（容器内 mysqldump 可用，宿主无需装 client；容器名 env `BACKUP_MYSQL_CONTAINER` 默认 acore-portal-test-mysql-1，生产部署时改）→ gzip → COS `backups/db/lokta-business-{yyyyMMdd}.sql.gz`
- 游戏四库 weekly：backup.gameWeekly=true 且周日触发；四库连接串从 system_config gamedb.* 解析（host/port/user/pass/db），dump 命令同容器法不可用（游戏库在别的容器/主机）→ 走 `mysqldump -h … `（宿主装 client 或在同网络容器跑，部署文档给两种路径，默认假设业务 MySQL 容器内可网达游戏库）
- 保留清理：列 COS `backups/db/` 前缀按 datedFilename 解析，> backup.retentionDays（默认 30）删除
- 凭据治理：脚本只在内存持有密钥（system_config 读取），不打印不落日志（宪法 VI）；COS 上传走 SDK 签名 URL 直传
- 恢复演练（SC-308）：docs 步骤=建临时 schema → gunzip | mysql → 核对 user/order/article 行数 → 冒烟；test 栈演练一次留记录于 docs 文档尾注
- 调度：宿主 crontab 示例入文档（M4 不建调度服务，宪法 VII）

## R11 六工具页与 iframe 契约

**结论**: `constants/tools.ts` 收口 URL 常量；六页 SSR 薄壳 + 共享 `components/site/tools-iframe.tsx`。

- 页面：/online（rank.lokta.cn/ranking）/online-players（/online）/playermap（/playermap）/hardcore（/hardcore）/banlist（/banlist）/dkp（webdkp.nfuwow.com）
- iframe：height=`calc(100vh-头部)` 风格撑满、loading="lazy"、title 无障碍；顶部常驻「新窗口打开」外链按钮（iframe 拦截策略变化时的保底出口）；onLoad 超时（12s）降级提示卡片+外链
- 导航接线：navigation.ts 摘 m4 标记——公告▾封号记录→/banlist；数据库▾英雄榜→/hardcore、在线玩家→/online-players、在线地图→/playermap、DKP查询→/dkp；**在线查询不进导航**（旧站口径，直达+301 可达）
- rank 不可用（内网/停机）时 iframe 域名解析失败→降级卡片文案「工具服务暂不可用」+外链，页面本身必须 200（SC-301 只断言页面可达与 iframe 目标，不 rank 可用性）

## R12 看板库内指标

**结论**: `services/stats/dashboard.ts` 聚合只读查询；/admin/stats RSC + requireAdmin；手动刷新按钮（不引入轮询）。

- 区块：①今日在线（复用 getServerStatus，探针离线显「数据延迟」）②文章阅读 top10（article orderBy views desc）③404 top（Redis 近 7 日 `stats:404:*` HGETALL 内存合并，取 top10）④近 7 天订单数 + 积分消耗（pointTransaction type=shop_payment 且 amount<0 的 SUM 取绝对值）⑤近 7 天新注册（user createdAt）
- Umami 区块独立容错：API 失败仅该区块「暂不可用」，不拖垮整页（FR-313）
- 权限：requireAdmin（RSC 深校验，照 M2 后台口径）；无变更动作故无审计需求

## R13 Turnstile 前端接线点

**结论**: 登录/注册表单为 client 组件，增加 widget 容器与 token state；提交体带 `turnstileToken`。

- siteKey 由页面 server 组件经 config 读出传 props（enabled=false 传 null → 表单跳过 widget）
- Turnstile challenge 过期（token 3 分钟有效）：widget `expired-callback` 自动 reset；提交时无 token → 前端阻断提示
- 测试密钥 `1x…AA` 无交互直通，E2E 流水线零改动；`2x…AB`（恒失败）用例注入 config 后断言 422（集成层）

## R14 配置模式扩展与启动兼容

**结论**: lib/config.ts 扩 5 组，严格区分 optional 组（turnstile/umami/backup 照 cos：键缺失=undefined 功能未启用）与带默认值组（security/notify：键缺失走默认，不阻塞启动）。

- flattenToSchema 补 5 组映射；configSchema 相应扩展（security/notify 用 z.default）
- instrumentation 启动预热不受影响（现有 fail-fast 面不变，新组全部可缺省）
- seed/init-system-config.sql 不强制补新键（缺省语义友好）；test 栈手动补 turnstile 测试密钥与 umami 键做联调
- **部署坑位注记**（承接 2026-10-25 教训）：配置变更后 web 容器需 restart 才生效（lib/config 进程内缓存；settings 页走 reloadSystemConfig 免重启，但 initdb/手改 SQL 场景仍需重启）——写入 backup-restore.md 与 launch-checklist
