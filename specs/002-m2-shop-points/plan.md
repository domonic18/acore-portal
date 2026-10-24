# Implementation Plan: M2 营收 — 积分体系 + 商城全链路 + 后台最小集

**Branch**: `002-m2-shop-points` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-m2-shop-points/spec.md`

## Summary

交付营收闭环：①积分账本完整域（6 类流水枚举、消费扣减、规则表、手动调整、双保险对账）；②商城前台（商品/分类、`/shop` 列表、详情+Wowhead、角色选择组件、购物车）；③结账发货闭环（强制登录、角色归属校验、同事务扣分+订单+库存、SOAP 发货幂等、状态机自动 completed、失败可见+人工补发）；④9+ 服务类处理器（策略模式+专属参数矩阵+装备恢复选物）；⑤运营后台最小集（RBAC、商品管理含 SKU 校验、订单补发/退款、用户积分手调/徽章/邀请码）；⑥商城存量迁移（99 商品/1,897 订单按 D3 口径清洗、图片上 COS、D7 对账基准）。

技术路线：沿用 M1 单体与依赖方向（`app → server → lib → constants`）；业务库新增 Product/ProductCategory/CartItem/Order/OrderItem/PointRule/Badge/BadgeGrant/ImageAssetMap 等表并扩展 PointTxType/UserRole 枚举；发货复用 M1 SOAP 命令层（soap_call 审计）+ 新增处理器注册表（server/services/shop/handlers）；支付一致性=单事务（扣分+订单+库存条件更新）+ 事务外幂等发货（幂等键=订单行 ID）；对账以存量余额为准（D7），差异补录调整流水抹平后回归"余额=流水"自洽；COS 凭据入 system_config（宪法 VI 配置分域）。

## Technical Context

> 沿用 M1「规划基线」状态标注：`docs/arch/00` 定稿后升级为「结论」。

**Language/Version**: TypeScript 5（strict）+ Node.js 22 LTS（与 M1 一致）

**Primary Dependencies**: Next.js App Router 单体 · Prisma · node-soap（M1 命令层复用）· nodemailer · ioredis · Zod · 新增：腾讯云 COS SDK（cos-nodejs-sdk-v5，图片迁移+读取签名）· Wowhead tooltip 外链脚本（前台浮窗，可降级）

**Storage**: MySQL 8.4 ×5 库不变；业务库新增 8 张表 + 2 个枚举扩展；Redis 仅限 M1 既有用途（会话），M2 不新增 Redis 数据结构（库存/余额并发控制走 MySQL 行锁）

**Testing**: Vitest（单元/集成）+ Playwright E2E；验收锚点 SC-101（测试订单全链路）与 SC-105（对账差异清零）为自动化用例

**Target Platform**: 不变（Linux docker compose + caddy；开发 compose 含 soap-mock）

**Project Type**: web-application（全栈单体）

**Performance Goals**: 不设硬指标（6K 用户规模）；结账提交 P95 < 1s（不含发货）；`/shop` 列表 P95 < 500ms

**Constraints**: 发货状态机必须自动闭环（修复 1,895 滞留教训）· 扣分/订单/库存同事务 · 发货幂等键防重复 · 游戏四库零 DDL（world 库只读校验 SKU）· COS 凭据入 system_config 不入 env · 真实货币网关仅预留 · 积分券/订单邮件/D6 寄他人明确不做

**Scale/Scope**: 6,330 用户（6,248 持币）；6 US / 33 FR / 8 SC；业务库新增约 8 表；前台新增 3 页（/shop、/shop/[slug]、/cart、/checkout）+ 用户中心 2 页补全（orders 列表/详情）+ 后台约 6 页

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 门禁问题 | 状态 |
|------|----------|------|
| I 账号一致性三铁律 | 下单是否强制绑定本人角色且服务端校验？ | ✅ PASS — FR-113/FR-119：角色下拉仅本人角色、结账与发货前双重归属校验、越权记审计（复用 M1 account/characters 归属校验路径） |
| II 发货必须可靠可见 | 状态机是否自动闭环、失败是否可见可补发、是否幂等？ | ✅ PASS — FR-116~118：paid→delivering→completed 自动推进；delivery_failed 可见+重试队列+后台补发；幂等键=订单行 ID（research R2）；soap_call 全量审计 |
| III 积分账本可重算 | 余额是否恒等于流水累加？D7 以存量余额为准是否破坏不变式？ | ✅ PASS — 运行期一切变动同事务写流水（FR-101）；D7 仅作用于迁移切换点：以存量余额为准、差异补录 manual 调整流水抹平，抹平后回归"余额=流水"自洽（research R9）；此后日终对账守恒 |
| IV 兼容与无感迁移 | 商店四件套路径与存量数据是否兼容迁移？ | ✅ PASS — /shop /cart /checkout /my-account 路径不变（FR-109）；存量商品/订单按 D3 口径幂等导入（FR-131）；图片 URL 重写映射表保旧链可达（FR-132） |
| V 数据边界与生产只读 | 是否零 DDL 于游戏库？SKU 校验与发货是否守边界？ | ✅ PASS — world 库仅 SELECT item_template 校验 SKU 存在性（FR-126）；发货一律经 SOAP 命令通道，不直写游戏库；characters 库只读投影 |
| VI 安全纵深（含配置分域） | 三重服务端校验与凭据存放是否合规？ | ✅ PASS — 角色归属/SKU 映射/RBAC 后台守卫全在服务端（FR-119/125/126）；COS 凭据入 system_config 经 lib/config.ts 收口（v1.0.2），不入 env/文档/日志；越权与后台敏感操作全审计 |
| VII 单体优先 · YAGNI | 是否引入未论证复杂度？ | ✅ PASS — 无新中间件；唯一新依赖为腾讯云 COS SDK（图片迁移硬需求）；购物车存 DB 不引 Redis 结构；真实货币网关仅预留枚举位；积分券/订单邮件/D6 明确不做 |
| VIII 行为变更必有测试 | 验收锚点是否有自动化用例？ | ✅ PASS — SC-101 全链路 E2E、SC-102 失败注入+幂等集成测试、SC-104 并发库存/余额集成测试、SC-105 对账用例（quickstart S1-S6） |

**Post-design 复检**：Phase 1 完成后维持全 PASS；无违例需 Complexity Tracking 论证（M1 遗留的 Turnstile deferral 不变，仍归 M4）。

## Project Structure

### Documentation (this feature)

```text
specs/002-m2-shop-points/
├── plan.md              # This file
├── research.md          # Phase 0 output（R1-R12 技术决策）
├── data-model.md        # Phase 1 output（新表/枚举扩展/状态机/并发约束）
├── quickstart.md        # Phase 1 output（S1-S6 验证场景）
├── contracts/           # Phase 1 output
│   ├── api-shop.md      # 前台商城接口（列表/详情/购物车/结账/订单）
│   ├── api-admin.md     # 后台接口（商品/订单/用户/积分/徽章/邀请码）
│   └── soap-delivery.md # 发货通道契约（处理器注册表/命令映射/幂等/审计）
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
prisma/schema-business/     # 新增 Product/ProductCategory/CartItem/Order/OrderItem/
                            # PointRule/Badge/BadgeGrant/ImageAssetMap + 枚举扩展
src/
├── app/
│   ├── shop/               # 列表 + 详情（/[slug]）
│   ├── cart/  checkout/    # 购物车 + 结账
│   ├── account/orders/     # 用户订单列表/详情（补全 M1 空态页）
│   ├── admin/              # (admin) 布局守卫 + products/orders/users/categories
│   └── api/                # Route Handlers 薄层（契约见 contracts/）
├── server/services/
│   ├── points/             # 账本（credit/debit/规则引擎/对账任务）← ledger.ts 迁移归位
│   ├── shop/               # 商品/购物车/结账/订单状态机
│   │   └── handlers/       # 服务类处理器注册表（itemsend/改名/阵营/…）
│   ├── orders/             # 订单查询/补发/退款
│   ├── catalog/            # 商品/分类管理（后台）
│   ├── users-admin/        # 用户列表/积分手调/徽章/邀请码
│   └── images/             # 图片资产映射/URL 重写
├── server/soap/            # M1 命令层复用；新增发货命令封装
├── lib/
│   ├── config.ts           # 新增 cos.* 配置组
│   └── cos/                # COS client（惰性建连，仿游戏库模式）
└── constants/              # 新增：订单状态/商品类型/流水类型扩展/处理器 SKU 键

scripts/migrate/            # shop-import.sql（商品/订单/积分清洗导入,幂等）
                            # cos-upload.mjs（uploads 扫描上传+映射表回填）
scripts/cron/               # reconcile-points.(sh|mjs) 日终对账任务
tests/
├── unit/                   # 生效价/状态机迁移/处理器校验/SKU 校验/参数矩阵
├── integration/            # 支付事务（并发扣分/库存）/发货幂等/对账/迁移导入
└── e2e/                    # 全链路下单→扣分→mock 发货→completed；购物车；后台
```

**Structure Decision**: 沿用 M1 单体与依赖方向；**开工前置工程任务**：`src/server/services/` 根目录平文件（ledger/characters/mail-outbox/user-token/audit/route-map）按 AGENTS 目录规范迁移归位到 `points/`、`account/`、`mail/`、`token/`、`audit/`、`routes/` 子目录（CodeReview W2 遗留，纯移动不改行为，随 US0 首批提交）。

## Complexity Tracking

> 无新增违例。M1 遗留 deferral（Turnstile+登录限速归 M4，公网暴露前必须启用）继续有效，此处不重复论证。
