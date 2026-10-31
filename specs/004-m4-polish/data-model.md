# Data Model: M4 完善

**Branch**: `004-m4-polish` | **Date**: 2026-10-25 | 依赖: research.md R1-R14

> 变更面刻意最小：业务库 **+1 表**（YAGNI 对照 M3 十表）；无新枚举表结构级变更；扩展面集中在 system_config KV 与 Redis 键。

## 1. 业务库新表

### notification（站内信）

```prisma
model Notification {
  id        BigInt    @id @default(autoincrement())
  userId    BigInt    @map("user_id")
  type      String    @db.VarChar(32) // "points"（M4 仅此一类；system 预留字符串，不做枚举）
  title     String    @db.VarChar(128)
  body      String    @db.VarChar(512)
  linkUrl   String?   @map("link_url") @db.VarChar(256)
  readAt    DateTime? @map("read_at")
  createdAt DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  user      User      @relation(fields: [userId], references: [id])
  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@map("notification")
}
```

- User 模型反向关系：`notifications Notification[]`
- **无唯一约束**（防重由账本 refType+refId 唯一保障，通知是账本同事务派生行，R3）
- readAt=null 即未读；「全部已读」= updateMany where readAt=null
- 删除策略：M4 不做清理任务（量级=积分事件级，年千条级）；后续量大再议归档

### 迁移

- `prisma/schema-business/migrations/2026102???????_m4_notification/migration.sql`（迁移目录名以实际生成时间为准）
- 幂等：db:deploy 标准语义；test 栈与 E2E 隔离库均走 db:deploy

## 2. system_config 配置面扩展（lib/config.ts schema）

| 组 | 键 | 类型/默认 | optional | 说明 |
|---|---|---|---|---|
| turnstile | turnstile.enabled | bool，默认 false | ✅ 整组 optional | R1；enabled=true 时 siteKey/secretKey 必填（superRefine） |
| | turnstile.siteKey | string | | 公开值，前端展示 |
| | turnstile.secretKey | string | | 仅服务端；后台掩码 |
| security | security.loginMaxFails | int，默认 5 | ❌ 带默认 | R2 |
| | security.loginWindowSec | int，默认 900 | | 失败计数窗口 |
| | security.loginLockSec | int，默认 900 | | 锁定时长 |
| notify | notify.pointEmailThreshold | int，默认 0（0=不发） | ❌ 带默认 | R4；绝对值比较 |
| umami | umami.scriptUrl | url | ✅ 整组 optional | R5；未配置=不注入不拉数 |
| | umami.websiteId | string | | |
| | umami.apiUrl | url | | 看板 API 拉数 |
| | umami.apiUsername / umami.apiPassword | string | | API 取 token |
| backup | backup.retentionDays | int，默认 30 | ✅ 整组 optional | R10；备份脚本读取 |
| | backup.gameWeekly | bool，默认 true | | 游戏四库周备开关 |

- flattenToSchema / configSchema 同步扩展；instrumentation 预热不变（全部可缺省）
- test 栈联调补键：turnstile（测试密钥）+ umami 五键（compose 起服后 websiteId 手动建档）
- 敏感键清单（后台掩码展示）：smtp.password（既有）/ turnstile.secretKey / umami.apiPassword

## 3. Redis 键面

| 键 | 类型 | TTL | 用途 |
|---|---|---|---|
| rl:login:fail:u:{username} | string(INCR) | loginWindowSec | 账号维失败计数（R2） |
| rl:login:fail:ip:{ip} | string(INCR) | loginWindowSec | IP 维失败计数（XFF 存在才写） |
| login:lock:u:{username} / login:lock:ip:{ip} | string(SET 1) | loginLockSec | 锁定标记 |
| stats:404:{yyyyMMdd} | hash(HINCRBY path→count) | 48h | 404 日路径计数（R6） |
| rl:404:{ip} | string(INCR) | 60s | 404 beacon 防刷（30 次/分） |
| umami:token | string | 30min | Umami API token 缓存（R5） |

- 均为非账务缓存/计数，丢失可重建（对账面零影响）

## 4. Umami 外部库（不在 Prisma 管）

- schema `umami`，账号 `umami` 仅限本 schema DDL/DML（Umami 自跑迁移）
- 业务库账号权限零变更（R5 数据边界）；业务 MySQL 容器内同实例承载
- website 建档：Umami UI 手动建一次 → websiteId 入 system_config

## 5. 审计面

| 动作 | 时机 | 记录内容（脱敏口径） |
|---|---|---|
| LOGIN_LOCKED | 触发锁定时 | 提交用户名（原串）/ ip / 计数值——不记密码 |
| SETTINGS_CHANGED | 设置组保存成功 | 组名/键名/掩码 diff（「(变更)」标记），不落值 |
| SETTINGS_TEST_MAIL | 测试发信 | to 地址 + 成败 |

- 沿用 AuditCategory 既有 admin/auth 域（AUDIT_ACTION 常量新增三条），不扩枚举域

## 6. 邮件模板

- `MAIL_TEMPLATE.POINTS_NOTIFY`：「积分变动通知」，payload {username, delta, balance, reason}，无一次性链接（link=/account/points 复用字段）
- 发送通道：enqueueMail(tx) → outbox（重试/审计沿用 M1）

## 7. 数据面总量对账锚点

| 项 | 预期 |
|---|---|
| 业务库表数 | 27（M3 后 26 + notification）——以 db:deploy 后实际计数核对 |
| sitemap 条目 | 文章 110(publish 108)+商品 61+版块 5+主题~255+静态页 4+固定路由 8 ≈ 440±（SC-309 对账以库 count 为准） |
| route_map | 392 + 6 = 398（幂等重跑零新增） |
