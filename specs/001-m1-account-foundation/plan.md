# Implementation Plan: M1 地基 — 账号全链路 + 游戏集成 + 路由兼容

**Branch**: `001-m1-account-foundation` | **Date**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-m1-account-foundation/spec.md`

## Summary

交付新系统地基：①账号全链路（邀请码注册→邮件激活设密→phpass 存量无感登录→找回/改密双写游戏端）；②用户中心 8 页；③游戏集成基座（四库直连 + SOAP 命令通道）；④旧路由 301 兼容层；⑤积分最小账本（流水+余额，服务注册奖励 +2）。

技术路线：Next.js 全栈单体（规划基线，`docs/arch/00` 定稿前以此为依据）+ Prisma 多数据源（业务库可迁移、游戏四库只读 introspect、auth 库按契约写账号表）+ 目标哈希沿用 WP6.8 bcrypt 格式（HMAC-SHA384 预哈希 + bcrypt，research R1 方案 Y，phpass 为唯一过渡垫片）+ Redis 会话 + node-soap 命令层（超时/重试/幂等/审计）。关键设计取向：游戏库防写以 **MySQL 账号权限**为根本防线（应用层封装仅兜底）；"同密契约"指同一明文双端各自哈希（站点 `$wp$` bcrypt / 游戏端 SHA1）；事务邮件走 outbox 表保证失败可见。

## Technical Context

> 状态标注：以下为「规划基线」（AGENTS.md Tech stack + research/01 §7），`docs/arch/00` 定稿后升级为「结论」。基线变更须同步宪法附加约束章节。

**Language/Version**: TypeScript 5（strict）+ Node.js 22 LTS

**Primary Dependencies**: Next.js（App Router，全栈单体）· React 18 · Prisma · node-soap · nodemailer · ioredis · Zod · 目标哈希 = WP6.8 bcrypt 格式完整沿用（`$wp` 前缀 + HMAC-SHA384 预哈希 + bcrypt cost 12，research R1 方案 Y）· phpass 过渡垫片自实现 · bcryptjs（纯 JS，长期）

**Storage**: MySQL 8.4 ×5 库 — `acore_portal`（业务库，Prisma migrations 唯一 schema 真相源）+ 游戏四库 `acore_auth`（只读 + 账号表契约写）/`acore_characters`/`acore_world`/`eluna`（只读）· Redis 7（会话/限速预留/热点缓存）

**Testing**: Vitest（单元/集成）+ Playwright（关键链路 E2E）——规划基线；验收锚点 SC-001（100 老账号登录）为自动化用例

**Target Platform**: Linux 服务器 docker compose + caddy（与 invest 生产同套路）；开发环境 docker compose（mysql+redis+游戏库结构 fixture+SOAP mock）

**Project Type**: web-application（全栈单体）

**Performance Goals**: M1 不设硬性能指标（6K 用户规模远未达瓶颈）；E2E 全链路（注册→收邮件→设密→双端登录）5 分钟内可走完（对齐 SC-002）

**Constraints**: 三铁律（双写/同密/无半成品账号）· 游戏四库零 DDL · phpass 无感升级一人一次 · 事务邮件与 SOAP 调用失败必须可见 · Turnstile+登录限速按计划归 M4（见 Complexity Tracking）

**Scale/Scope**: 6,330 存量用户；7 用户故事 / 30 FR / 7 SC；业务库新增约 11 张表；用户中心 8 页 + 后台邀请码管理 1 页

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 门禁问题 | 状态 |
|------|----------|------|
| I 账号一致性三铁律 | 注册/改密链路是否双写且无半成品账号？ | ✅ PASS — 注册为跨库事务：游戏账号创建失败则站点侧整体回滚；用户名/邮箱两侧唯一性预检 + 唯一索引兜底（data-model §并发约束） |
| II 发货必须可靠可见 | M1 的 SOAP 通道与事务邮件失败是否可见？ | ✅ PASS — soap_call 表（重试/状态/审计）+ mail outbox 表（失败可见可重试）；M1 无发货链路，通道可靠性先行验证（US6） |
| III 积分账本可重算 | 余额是否可由流水重算推导？ | ✅ PASS — point_account 为缓存，注册奖励入账同事务写流水；重算校验为集成测试断言（quickstart S1） |
| IV 兼容与无感迁移 | 存量哈希透明升级与旧 URL 跳转是否就位？ | ✅ PASS — 登录按前缀双格式校验（`$P$` phpass / `$wp$` bcrypt，research R2）；仅 `$P$` 用户首登重哈希为 `$wp$` bcrypt（一人一次），`$wp$` 用户零接触；`/wp-login.php` 302 + route_map 301 层（US7） |
| V 数据边界与生产只读 | 是否零 DDL 于游戏库、凭据仅 env？ | ✅ PASS — Prisma 仅管理 acore_portal 迁移；游戏库 db pull 只 introspect；防写根本防线=MySQL 账号权限（research R5）；凭据仅 .env |
| VI 安全纵深 | 边界校验/归属校验/审计是否落地？ | ⚠️ PASS with deferral — Zod 边界校验、角色归属服务端校验、审计日志随 M1；Turnstile+登录限速按 development-plan 归 M4（见 Complexity Tracking） |
| VII 单体优先 · YAGNI | 是否引入未论证的复杂度？ | ✅ PASS — Next.js 单体；新增依赖仅 bcryptjs（纯 JS，兼作目标格式实现与存量校验）；argon2id 弃用（方案 Y 简化裁决，2026-10-23）；无新中间件 |
| VIII 行为变更必有测试 | 验收锚点是否有自动化用例？ | ✅ PASS — SC-001 抽样登录用例、phpass 黄金向量单测、账本重算集成测试、注册/登录/改密 E2E（quickstart） |

**Post-design 复检**：Phase 1 完成后全部维持 PASS，无新增违例；仅存的 deferral 已在 Complexity Tracking 论证。

## Project Structure

### Documentation (this feature)

```text
specs/001-m1-account-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── api-auth.md      # 认证链路接口契约（注册/激活/登录/找回/改密）
│   ├── api-account.md   # 用户中心接口契约（8 页数据面）
│   ├── api-admin.md     # 后台邀请码接口契约
│   └── soap-channel.md  # SOAP 命令通道契约（命令/幂等/审计）
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
prisma/
├── schema-business/         # acore_portal 业务库（可 migrate，唯一 schema 真相源）
├── schema-auth/             # acore_auth（introspect；account 表契约写入在 lib 层收口）
├── schema-characters/       # acore_characters（只读 introspect）
├── schema-world/            # acore_world（只读 introspect，M1 仅占位）
└── schema-eluna/            # eluna（只读 introspect，M1 仅占位）

src/
├── app/
│   ├── (auth)/              # login / register / register/set-password / forgot-password / reset-password
│   ├── account/             # 用户中心 8 页（overview/characters/points/orders/item-restore/raf/settings/address）
│   ├── admin/
│   │   └── invitation-codes/  # 邀请码后台（生成/列表/启停）
│   └── api/                 # Route Handlers（薄层，契约见 contracts/）
├── server/
│   ├── services/            # auth / invitation / account-sync / ledger / route-map / mail-outbox
│   └── soap/                # SOAP 命令层（client 封装/重试/幂等/审计）
├── components/              # 展示组件（禁止直连数据库）
├── lib/
│   ├── db/                  # 5 个 Prisma client 实例（business/auth/characters/world/eluna）
│   ├── redis/               # 会话存储
│   ├── auth/                # phpass 过渡垫片 / bcrypt(wp 格式) 封装 / 会话签发
│   └── mail/                # nodemailer + outbox 消费
├── constants/               # 枚举：邀请码状态/积分流水类型/审计类别/token 用途/SOAP 命令名
└── styles/

scripts/
├── dev/                     # init-game-schemas.sql（dev 游戏库结构 fixture）/ seed 脚本
└── verify/                  # SC-001 存量账号抽样登录校验脚本（M1 末执行）

tests/
├── unit/                    # phpass 向量 / 密码策略 / 邀请码状态机 / 账本重算
├── integration/             # 跨库事务（注册双写回滚）/ 会话 / 301 层
└── e2e/                     # Playwright：注册全流程 / phpass 登录 / 改密 / 8 页可达
```

**Structure Decision**: Next.js 全栈单体单仓；依赖方向强制 `app → server → lib → constants`（客户端组件禁止 import `server/`，以 `server-only` 包强制）；业务逻辑下沉 `server/services/`，Route Handlers 保持薄层。游戏库访问全部经 `lib/db` 收口——auth client 仅暴露 `createAccount`/`updateCredential`/查重三个契约写方法，其余一律只读。

## Complexity Tracking

> 仅记录需要论证的违例/偏差。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| M1 无 Turnstile + 登录限速（宪法 VI 列为登录/注册硬性要求） | development-plan 将 Turnstile+限速规划在 M4 横切；M1-M3 为内测期不公网暴露，新旧切换（M4 末）前防线已就位 | 随 M1 提前实现将扩大首里程碑范围、拖慢「100 老账号登录」验收锚点；已确认取舍（spec Assumptions）。**约束：公网暴露前必须启用，否则视为宪法 VI 违例** |
