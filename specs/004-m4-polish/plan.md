# Implementation Plan: M4 完善 — 工具页 + 通知 + 安全横切 + 统计与运维

**Branch**: `004-m4-polish` | **Date**: 2026-10-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-m4-polish/spec.md`（Q1-Q4 已裁决归档）

## Summary

交付最后一个开发里程碑：①工具页六页（rank.lokta.cn 五页 iframe + DKP 外部页，route_map 补 6 键收口 M3 遗留 404，导航 m4 占位接线）；②防滥用横切（Cloudflare Turnstile 登录/注册人机验证 + 登录失败限速与锁定，launch-checklist 公网前硬性项清账）；③通知域（notification 站内信模型 + 五类积分事件同事务挂钩 + 收件箱/未读徽标/弹泡 + 阈值邮件走 mail_outbox）；④统计看板（Umami 自托管容器承接流量指标 + 库内指标聚合 + 404 路径 Redis 计数）；⑤系统设置与备份（/admin/settings 分组配置热生效 + 测试发信 + mysqldump→COS cron 备份与恢复演练）；⑥SEO sitemap/robots（M3 FR-213 遗留收口）。

技术路线：沿用 M1-M3 单体与依赖方向；业务库仅新增 notification 一表（YAGNI 对比 M3 十表）；配置面扩 5 组（turnstile/security/notify/umami/backup，optional 组照 cos 先例不阻塞启动）；登录/注册路由挂 Turnstile siteverify 与 Redis 锁（lib/redis 扩展）；通知服务归「通道域」（与 mail 同层，比照 auth→mail 先例）；Umami 官方镜像入 compose 独立 schema；备份脚本走 cos-upload.mjs 同款「.env 引导 + system_config 取凭据」模式。

## Technical Context

> 沿用 M1「规划基线」状态标注：`docs/arch/00` 定稿后升级为「结论」。

**Language/Version**: TypeScript 5（strict）+ Node.js 22 LTS（与 M1-M3 一致）

**Primary Dependencies**: Next.js App Router 单体 · Prisma · ioredis（会话/限速/404 计数/Umami token 缓存）· Zod · nodemailer（M1 复用）· COS SDK（M2 复用，备份上传）· **新增**：Umami v2 官方镜像（外部服务，非 npm 依赖）· Turnstile 官方 api.js（外链脚本，零 npm 依赖，widget 手动渲染）

**Storage**: MySQL 8.4 ×5 库不变；业务库新增 notification 1 表 + User 关系扩展；**Umami 独立 schema**（同 MySQL 实例，独立账号限权，Umami 自管迁移）；Redis 新增键面见 data-model §3

**Testing**: Vitest（单元/集成）+ Playwright E2E；验收锚点 SC-301（六页+301）/SC-302（Turnstile 两态）/SC-303（锁定恢复）/SC-304（事件→站内信事务性）/SC-305（阈值邮件）/SC-309（sitemap 覆盖）为自动化用例；SC-308 恢复演练文档化执行

**Target Platform**: 不变（Linux docker compose + caddy；test compose 增 umami 服务）

**Performance Goals**: 不设硬指标；收件箱分页 P95 < 200ms；看板聚合 P95 < 800ms（Umami API 为外部延迟，容许 2s）；404 beacon P95 < 50ms（纯 Redis）

**Constraints**: 账本零结构变更（通知为同事务旁路写，回滚不残留）· Turnstile 关闭态直通（开发/test 默认关，公网开）· IP 维度限速仅在可信 XFF 存在时启用（防代理共享 IP 自锁）· 404 只记路径不记访问者（隐私）· SMTP/COS/Turnstile 密钥后台页掩码展示 · 后台群发通知/推送/自建 BI 不做（YAGNI）

**Scale/Scope**: 6 US / 18 FR / 9 SC；业务库 +1 表；配置 +5 组；前台 +6 页（工具页）；后台 +2 页（看板/设置）+ 收件箱 1 页；新脚本 backup.mjs + route-map-m4.sql；新文档 docs/ops/backup-restore.md

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 门禁问题 | 状态 |
|------|----------|------|
| I 账号一致性三铁律 | M4 是否触碰账号写路径？ | ✅ PASS — 登录/注册仅新增验证前置与失败计数（不改凭据/双写语义）；通知只读账本事件 |
| II 发货必须可靠可见 | 是否影响发货链路？ | ✅ PASS — 购买扣分的通知为账本同事务附加写，发货状态机零变更 |
| III 积分账本可重算 | 是否引入余额变动？ | ✅ PASS — 通知/邮件为账本事件旁路读；SUM(flows) 不变式不受影响；对账脚本零改动 |
| IV 兼容与无感迁移 | 旧 URL 是否收口？ | ✅ PASS — 6 个 M3 遗留 404 page_id 补键 301（FR-302，SC-301）；sitemap 补齐语义化 URL 出口（FR-318） |
| V 数据边界与生产只读 | 游戏库是否零 DDL、只读？ | ✅ PASS — 工具页 iframe 不触游戏库；看板复用 M3 status 只读探针；游戏库备份走各自连接只读 dump；Umami 独立 schema 不混业务库 |
| VI 安全纵深（含配置分域） | 防滥用如何落地？密钥如何治理？ | ✅ PASS — Turnstile+限速+锁定为里程碑核心（宪法 VI deferral 到期清账）；Turnstile/Umami/SMTP/COS 密钥全部 system_config + 后台掩码；404 不记身份；备份制品 COS 私有读；锁定计数含不存在用户名（防探测枚举） |
| VII 单体优先 · YAGNI | 是否引入未论证复杂度？ | ✅ PASS — 新外部服务仅 Umami（Q3 用户裁决）；无 npm 新依赖（Turnstile 手动渲染/备份复用 SDK）；后台群发/定时通知裁剪；搜索已取消（Q1）；业务库仅 +1 表 |
| VIII 行为变更必有测试 | 验收锚点是否有自动化用例？ | ✅ PASS — SC-301~305/309 映射 quickstart S1-S6 自动化（Turnstile 开关两态注入/锁定 Redis 状态注入/账本回滚通知不残留断言/sitemap 覆盖对账）；SC-306/307/308 演练+集成混合 |

**Post-design 复检**：Phase 1 完成后维持全 PASS；无需 Complexity Tracking 论证。

## Project Structure

### Documentation (this feature)

```text
specs/004-m4-polish/
├── plan.md              # This file
├── research.md          # Phase 0 output（R1-R14 技术决策）
├── data-model.md        # Phase 1 output（notification 表/配置组/Redis 键面/Umami 外部库）
├── quickstart.md        # Phase 1 output（S1-S6 验证场景）
├── contracts/           # Phase 1 output
│   ├── api-auth-m4.md       # 登录/注册 Turnstile+429 语义
│   ├── api-notification.md  # 收件箱/未读/已读
│   ├── api-admin-m4.md      # 设置/测试发信/看板
│   └── tools-and-seo.md     # 六工具页契约+route_map 键+sitemap/robots 口径
└── tasks.md             # /speckit-tasks output
```

### Source Code (layout)

```text
src/
├── app/
│   ├── online|online-players|playermap|hardcore|banlist|dkp/page.tsx  # 六工具页（US1）
│   ├── account/notifications/page.tsx                                  # 收件箱（US3）
│   ├── admin/stats/page.tsx                                            # 看板（US4）
│   ├── admin/settings/page.tsx                                         # 设置（US5）
│   ├── api/track/not-found/route.ts                                    # 404 上报（US4）
│   ├── api/account/notifications/...                                   # 未读/列表/已读（US3）
│   ├── api/admin/settings/route.ts + test-mail/route.ts                # 设置（US5）
│   ├── api/admin/stats/route.ts                                        # 看板聚合（US4）
│   ├── sitemap.ts / robots.ts / not-found.tsx                          # US6/US4
│   └── (auth)/login|register                                           # Turnstile 接线（US2）
├── components/site/tools-iframe.tsx                                    # iframe 壳（外链+降级）
├── constants/{tools.ts,mail.ts,navigation.ts,audit.ts}                 # 工具页 URL/邮件模板/导航接线/审计动作
├── lib/{turnstile.ts,umami.ts,config.ts,redis/rate-limit.ts}          # siteverify/Umami API/配置 5 组/锁扩展
├── server/services/{notification/,stats/,settings/}                    # 三新服务域
├── server/services/points/ledger.ts                                    # 通知挂钩（credit/debit 阻塞点）
└── scripts/cron/backup.mjs + docs/ops/backup-restore.md + scripts/migrate/route-map-m4.sql
```

### 复用底座清单（不重建）

| 底座 | M4 用法 |
|---|---|
| lib/config.ts（zod+缓存+reloadSystemConfig） | 扩 5 配置组；settings 页改完 reload 写穿（M3 status-config 先例） |
| lib/mail（transporter 按 smtp 配置指纹自动重建） | SMTP 页改配置即热生效（零额外工作）；阈值邮件走 enqueueMail |
| services/mail/outbox（enqueueMail(tx)/drainOutbox） | 积分阈值邮件入 outbox，重试/审计沿用 |
| lib/redis/rate-limit.ts（hitRateLimit 固定窗口） | 登录失败计数复用；锁定键新增小助手 |
| services/audit（writeAudit） | 锁定/设置变更/看板不涉审计外全走 writeAudit |
| services/status（getServerStatus 含缓存） | 看板「今日在线」直接复用 |
| services/routes（route_map 缓存+失效） | m4 补键后走 save/重启生效口径（M3 先例） |
| services/auth/login（loginWithPassword 统一模糊 401） | 限速/锁定前置在其外层路由挂载，防枚举文案不变 |
| nav m4 占位（navigation.ts m4:true） | US1 填真 href 摘除占位标记 |
| cos-upload.mjs「.env 引导+system_config 取凭据」模式 | backup.mjs 同款 CLI 形态 |
