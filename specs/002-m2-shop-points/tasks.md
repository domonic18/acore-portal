# Tasks: M2 营收 — 积分体系 + 商城全链路 + 后台最小集

**Feature**: specs/002-m2-shop-points | **输入**: [spec.md](./spec.md)（6 US / FR-101~133 / SC-101~108）· [plan.md](./plan.md) · [research.md](./research.md)（R1-R12）· [data-model.md](./data-model.md) · [contracts/](./contracts/)（api-shop / api-admin / soap-delivery）· [quickstart.md](./quickstart.md)（S1-S6）

**Tests 为硬性交付**（宪法 VIII）：每个 US 先写测试（先失败）再实现；`make check`（lint+typecheck+test）全绿为一切前提。发货命令契约以 [soap-delivery.md](./contracts/soap-delivery.md) 为唯一实现依据（mock 先固化；真机联调=上线前置清单，不在本里程碑验收门内）。

**开工前置（plan Structure Decision）**：Phase 2 含 US0 services 平文件归位（CodeReview W2 遗留）与 RBAC/COS/配置骨架，阻塞全部 US。

## 文件路径约定（M1 单体延续）

- 页面 `src/app/`（路由组：`(account)`/`(auth)`/`admin`）；API `src/app/api/` Route Handlers 薄层
- 服务层 `src/server/services/{points,shop,orders,catalog,users-admin,images,account,mail,token,audit,routes}/`；SOAP `src/server/soap/`
- 基建 `src/lib/`；常量 `src/constants/`；依赖方向 `app → server → lib → constants`
- schema `prisma/schema-business/`；迁移脚本 `scripts/migrate/`；对账任务 `scripts/cron/`；测试 `tests/{unit,integration,e2e}/`

---

## Phase 1: Setup（环境与基线）

- [x] T001 建立 `002-m2-shop-points` 分支，确认 M1 基线全绿：`make check`（lint+typecheck+63 vitest+17 E2E）
- [x] T002 扩展开发 seed：`scripts/dev/seed.ts` 增补 M2 测试数据骨架（测试账户+余额、分类、商品 fixtures 接线，具体数据集在 T009 落地）；dev compose（mysql 3307/redis/soap-mock）健康核验
- [x] T003 常量层扩展：`src/constants/points.ts` 流水类型扩为 6 类枚举映射（register_reward/badge_reward/shop_payment/manual_adjust/recurring/visitor_referral，照录 data-model §1.1 旧 ref 映射）；新建 `src/constants/shop.ts`（ProductType/ProductStatus/OrderStatus/OrderItemDeliveryStatus、SKU 前缀 `itemsend_`、低库存默认阈值）

**Checkpoint**: make check 全绿，工作区干净再进 Phase 2。

---

## Phase 2: Foundational（阻塞全部 US）

- [x] T004 US0 services 平文件归位（纯移动不改行为）：`src/server/services/ledger.ts→points/ledger.ts`、`characters.ts→account/characters-game.ts`（游戏侧底层 resolveGameAccountId/listOwnCharacters，与既有投影层 `account/characters.ts` 区分命名）、`mail-outbox.ts→mail/outbox.ts`、`user-token.ts→token/user-token.ts`、`audit.ts→audit/audit.ts`、`route-map.ts→routes/route-map.ts`；更新全部导入点（`src/server/soap/execute.ts`、`services/auth/*`、`services/account/*`、`api/account/*`、`app/legacy-redirect/[key]/route.ts` 等，grep 核对清零）；完成后 make check 全绿
- [x] T005 schema 迁移①（枚举+种子）：`prisma/schema-business/schema.prisma` 扩展 PointTxType 6 类、UserRole 加 `moderator`、AuditCategory 加 M2 类别；新增 PointRule 模型（data-model §2.6）+ `prisma migrate dev`（实施偏差：AuditCategory 扩为域分组 `shop/admin/points`，violation 等具体事件走 AUDIT_ACTION 常量；`register=2` 种子落 `scripts/dev/seed.ts` 的 seedPointRules 而非迁移 SQL，避免校验和漂移，dev/test/prod 统一走 seed）
- [x] T006 schema 迁移②（商城 10 表）：ProductCategory/Product/CartItem/Order(`@@map("shop_order")`)/OrderItem/Badge/BadgeGrant/ImageAssetMap/MigrationReviewItem，字段/索引/约束照录 data-model §2（Product.legacyWpProductId unique、Order.legacyWpOrderId unique、OrderItem.soapCallId FK、BadgeGrant unique(badgeId,userId)）；`prisma migrate dev`（实施偏差：`--name` 未透传，迁移目录为时间戳无名 `20261024035511`/`20261024035903`）
  - 依赖 T005（同文件串行）
- [x] T007 RBAC 骨架：`src/server/session-guard.ts` 增 `requireAdmin()`（复用 requireSession 模式；user/moderator → 403）+ `getApiAdminSession`（API 侧非 admin 审计后返回 null，调用方回 403）；越权即记 `admin_access_violation`（US5 消费）
- [x] T008 COS 配置组：`src/lib/config.ts` schema 增 `cos.bucket/region/secretId/secretKey/cdnBase` 5 键（凭据入 system_config，禁止入 env/文档/日志，宪法 VI）；新建 `src/lib/cos/client.ts` 惰性建连（未配置不阻塞启动，首用报错；SDK 仅 US6 迁移脚本消费）
- [x] T009 测试基座：`tests/fixtures/shop-seed.ts`（quickstart S2 前置：2 分类+5 商品=3 物品类含促销档期+2 服务类、测试账户余额分级 10/100/充足）；集成测试约定（每用例独立数据/清理钩子）；`make check` 全绿

**Checkpoint**: US0 归位 diff 零行为变更；迁移可重放；US1 仅依赖 T005，US2-US6 依赖 Phase 2 全部。

---

## Phase 3: US1 — 积分账本完整域（P1）

**目标**: FR-101~107 · SC-105 前置 · quickstart S1。一切变动以流水入账（余额快照），余额=流水可重算（宪法 III）。

**Tests（先写先失败）**:

- [x] T010 [P] [US1] 单测：`tests/unit/point-rules.test.ts` — point_rule 表驱动读取/enabled 开关/改 amount 后新注册奖励=新值/消费与手调不经规则表（research R10）
- [x] T011 [P] [US1] 集成：`tests/integration/points-ledger.test.ts` — 6 类流水入账含 balanceAfter 快照；SUM(流水)=balance 不变式；负余额拦截（手调 −10000）；手调缺原因；对账函数对被 SQL 篡改的账户准确点名（quickstart S1.3；402/422 状态码映射留待 US5 API 层）

**实现**:

- [x] T012 [US1] `services/points/ledger.ts` 扩展：credit/debit 统一入口（6 类流水、同事务写流水+余额、balanceAfter 快照、`LedgerError("INSUFFICIENT_BALANCE")` 拦截——updateMany WHERE balance>=amount 行锁条件 UPDATE 见 data-model §5，路由层按 code 映射 402）
- [x] T013 [US1] `services/points/rules.ts` 规则引擎：point_rule 读取+开关；`services/auth/register.ts` 注册奖励切规则表驱动（`REGISTER_REWARD_AMOUNT` 常量退役，种子值=2 行为不变，M1 回归测试守卫）
- [x] T014 [US1] `services/points/adjust.ts` 手动调整：原因必填 2-255、`manual_adjust` 流水（refType='admin'、refId=操作管理员 id）+ 审计 `points_adjust`（FR-105；US5 API 层复用）
- [x] T015 [US1] `services/points/reconcile.ts` 对账：全量重算逐户比对→差异清单（点名账户/重算值/现存值，不自动修复）+ `scripts/cron/reconcile-points.ts` 日终任务（实施偏差：.ts 而非 .mjs，与 seed.ts 同套路直连业务库；`pnpm cron:reconcile-points`，差异非空退出码 2 供 crontab/监控告警接线）+ 孤儿流水（有流水无户）同被点名
- [x] T016 [US1] 用户中心积分页补全：`src/app/(account)/account/points/pager.tsx` 类型列 6 类中文映射（POINT_TX_TYPE_LABEL）+ 独立备注列（M1 已有分页与余额展示，FR-107）

**Checkpoint（quickstart S1）**: 入账/扣减/手调各一笔流水正确；余额篡改→对账点名；日终对账连跑两次空差异；SC-105 前置就绪。

---

## Phase 4: US2 — 商城浏览与购物车（P1）

**目标**: FR-108~115 · quickstart S2。可与 Phase 3 并行实施（文件零交集：catalog/shop-cart vs points）。

**Tests（先写先失败）**:

- [x] T017 [P] [US2] 单测：`tests/unit/effective-price.test.ts` — 档期内=促销价/过期恢复原价/开始与结束瞬间边界（vitest 时间注入；服务端 now() 判定，FR-115）
- [x] T018 [P] [US2] 集成：`tests/integration/cart.test.ts` — 加购校验链：published→SKU 参数 schema（缺参数 422，FR-120 未选恢复物品不得加购）→角色归属 403+`ownership_violation` 审计→售罄 409→同商品同参数合并行；PATCH qty（售罄增数 409）/DELETE 404 防枚举（quickstart S2.3-5）（实施偏差：服务层直测而非 HTTP 层，状态码映射在 API 路由薄封装；游戏 fixture 经业务连接自建 auth 账号+characters 行，guid 段按 RUN 隔离）

**实现**:

- [x] T019 [US2] `services/catalog/products.ts` + `categories.ts`：列表查询（published+listed 过滤/分类筛选/price_asc|price_desc|newest 排序/分页 size 24）、详情（draft→404、listed=false 直链可达带标记）、`effectivePrice(now)`；`services/catalog/sku-check.ts`：gameItemId→world.item_template SELECT 存在性校验（只读，FR-126 复用）（实施偏差：列表 99 商品规模在应用层排序/分页，SQL 窗口排序属过度设计〔宪法 VII〕；item_template 模型+initdb fixture 已补落 dev/test 双库）
- [x] T020 [US2] 页面 `/shop`：`src/app/shop/page.tsx` 分类筛选/排序/分页（RSC 直读）+ 商品卡片（图/名/价/分类，FR-109 路径不变）（实施偏差：商品卡图用占位图形，Product 无图列〔data-model 权威〕，真图管线延 US6 COS）
- [x] T021 [US2] 页面 `/shop/[slug]`：图集/描述/划线价/Wowhead 浮窗（物品类，离线降级纯文本，Assumptions）+ 登录态角色下拉（复用 account/characters 投影；游戏库不可达降级提示不阻塞浏览）（实施偏差：单占位主图替代图集；未注册 SKU 服务类商品呈现"暂不支持在线购买"）
- [x] T022 [US2] `services/shop/cart.ts` + API：POST `/api/cart`（校验链照录 contracts/api-shop.md）/ PATCH·DELETE `/api/cart/[id]`（仅本人行，越权记审计）
- [x] T023 [US2] SKU 参数矩阵：`src/server/services/shop/param-schemas.ts` 按 SKU 定义 Zod schema（characterGuid 必填/restoreItemEntry/destAccount/guildName/unlockName——与 soap-delivery 处理器 validateSchema 同源，US4 复用）；未注册 SKU 的服务类商品加购拒绝
- [x] T024 [US2] 页面 `/cart`：行参数复核/数量调整/移除/小计；未登录加购引导登录（FR-111/112）
- [x] T025 [US2] 角色选择组件：`src/components/shop/character-select.tsx`（仅本人角色、服务端归属校验入口、参数随购物车行持久化）
- [x] T026 [US2] E2E：`tests/e2e/shop.spec.ts` — 列表筛选→详情→选角色→加购→复核→移除全流程；游客加购跳登录；越权直发他人 characterGuid 403

**Checkpoint（quickstart S2）**: 促销价生效/过期恢复；售罄可见禁购；购物车行参数逐行可见。（✅ make check 83 测试全绿+E2E 4/4；另落地实施注记：`characters-game.ts` 整体上收 `services/shared/game-identity.ts`〔AGENTS 业务域禁互引〕，5 消费方改导入）

---

## Phase 5: US3 — 结账支付与发货状态闭环（P1，核心锚点）

**目标**: FR-116~121 · SC-101/102/103/104 · quickstart S3。依赖 US1（ledger.debit）+ US2（购物车行）。

**Tests（先写先失败）**:

- [x] T027 [P] [US3] 单测：`tests/unit/order-state-machine.test.ts` — 合法迁移表全覆盖（pending→paid→delivering→completed 主链/delivery_failed 重试/refunded/cancelled）/非法迁移抛错（FR-116，data-model §3）
- [x] T028（偏差：结账用户须有游戏账号+自有角色，加购归属校验前置；双用户/同账户并发以 Promise.allSettled 真实竞争） [P] [US3] 集成：`tests/integration/checkout.test.ts` — 单事务原子性（扣分+Order(paid)+OrderItem 快照+扣库存+shop_payment 流水+清购物车行）；余额不足 402 无单无流水；双线程抢库存 1 恰 1 成功；同账户并发结账串行化无透支（用户行 FOR UPDATE，data-model §5）
- [x] T029（偏差：幂等键升级为 orderitem:{item_id}:{attempt}——M1 同键失败永久回放会阻断补发；attempt=既有 soap_call 数+1，成功回放不变/失败新键重试） [P] [US3] 集成：`tests/integration/delivery.test.ts` — soap-mock 契约：发货成功订单自动 completed（全程无人工）；失败注入→`delivery_failed`+deliveryError 可见；重复补发幂等键命中、命令总次数不变（SC-102）；每次调用落 soap_call 审计

**实现**:

- [x] T030 [US3] `services/shop/state-machine.ts`：OrderStatus 迁移表+状态时间戳回写+非法迁移抛错（集中管理，禁止散落 set）；`services/orders/queries.ts` 用户订单列表/详情（归属过滤）
- [x] T031 [US3] `services/shop/checkout.ts` 结账单事务（research R2）：条件扣余额→订单创建（orderNo=`M2{YYYYMMDD}{6位序列}`）→条件扣库存（stock_enabled 行锁）→流水→清车；促销价以服务端结算时刻生效价取值
- [x] T032（偏差：/__fail 按命令注入+/__executed 调试端点；三个 soap-mock 容器共用 scripts/dev 挂载，重启即生效） [US3] soap-mock 扩展：`scripts/dev/soap-mock.mjs` 增发货命令桩（`.send items` 优先+`.character`/`.guild` 系列占位）+ 确定性回执 + 失败注入开关（health=down/按命令注入失败）
- [x] T033（偏差：发货类命令 idempotent=false 不自动重试，失败转 delivery_failed 由补发新键重试；新增 cron:recover-deliveries 脚本） [US3] 发货管线：`server/soap/delivery.ts`（executeSoapCommand 包装，幂等键=order_item.id 透传 M1 机制）+ `services/shop/handlers/registry.ts`（DeliveryHandler 接口+resolveHandler：`itemsend_` 前缀→ItemSendHandler、未命中防御拒绝 `DELIVERY_NO_HANDLER`）+ `handlers/item-send.ts`（物品类最小集）+ `services/shop/delivery.ts` 逐行驱动（precheck→execute→行 delivered/failed→订单自动 completed/failed）；崩溃恢复：对账任务同周期扫描滞留 `delivering` 重新驱动（幂等兜底，research R1/R2）
- [x] T034 [US3] API + 页面：POST `/api/checkout`（401 禁游客/402/409/422，事务外异步发货触发）；`/checkout` 页面参数复核+余额展示+错误呈现
- [x] T035 [US3] 用户中心订单页补全：`account/orders/page.tsx` 列表（分页/状态徽标）+ `account/orders/[id]/page.tsx` 详情（条目/金额/状态/发货结果/下单参数）+ GET `/api/account/orders[/id]`（404 防枚举）+ 30s 轮询（delivering/delivery_failed 态，不引 WebSocket）
- [x] T036 [US3] E2E：`tests/e2e/checkout.spec.ts` — 登录→选角色→加购→结账→订单详情 completed（SC-101 全链路）；余额不足拦截路径

**Checkpoint（quickstart S3）**: 限量并发恰 1 单成功；失败注入→补发→幂等命中命令数不变；无透支无超卖。US3 完成即达成 M2 核心验收锚点。

---

## Phase 6: US4 — 服务类商品处理器（P2）

**目标**: FR-122~124 · SC-106 · quickstart S4。依赖 US3 发货框架就绪。

**Tests（先写先失败）**:

- [x] T037 [P] [US4] 单测：`tests/unit/handlers.test.ts` — resolveHandler 路由（前缀/精确键/未命中）；各处理器 validateSchema 参数矩阵（名字解锁首字母大写规范化、公会名合法性、装备恢复必选物品、destAccount 非空）
- [x] T038（偏差：自建 m4h-cat-{RUN} 分类+SKU 记忆化复用规避 product_sku_key 唯一冲突，不依赖共享 fixture；幂等键为 orderitem:{id}:1 attempt 后缀方案） [US4] 集成：`tests/integration/handlers-delivery.test.ts` — 每处理器 1 条 mock 实测订单（命令名/参数/幂等键=order_item.id/状态闭环，命令映射照录 soap-delivery 表）；装备恢复 precheck：mock health=down → 支付前拦截（FR-120）

**实现**:

- [x] T039（偏差：8 类服务命令确定性回执按需落地——itemsend 的 `.send items` T032 已有，物品类即全系统服务命令集） [US4] soap-mock 增补：T032 占位命令全部落地为确定性回执（11 处理器对应命令全覆盖）
- [x] T040（偏差：registerHandler 动态注册移除，registry 改字面量 Map；unlockName 规范化前移至 zod schema transform，加购即落库规范名；precheck 双拦=结账事务外先行 422 零写入+发货行前 failed，同一处理器钩子复用） [US4] `services/shop/handlers/` 10 处理器：item-restore（precheck 服务器在线）/char-change-race/faction/customize/rename（含 `name-unlock` 变体：unlockName 规范化+占用校验）/char-transfer/char-clone（destAccount 存在性查 auth 库）/guild-change——命令映射与校验照录 soap-delivery.md 表
- [x] T041 [US4] 装备恢复选物 UI：`/shop/[slug]` 选角色后异步加载可恢复物品单选浮窗（物品名/图标/质量色，复用 `/api/account/restore-items` M2 语义升级 `restorable` 标记）；未选物品不得加购
- [x] T042（偏差：参数采集表单与结账参数复核大部分已于 US2/US3 随 add-to-cart-form/checkout 页交付，本任务补齐服务类字段渲染联调与 FR-123 结账侧 schema 双重把关） [US4] 服务类参数采集：详情页按 param-schemas 渲染加购表单（目标账号/公会名/解锁名等），购物车与结账页参数复核（FR-123）；D6 反向声明：不提供寄他人角色入口（FR-124）
- [x] T043 [US4] handlers 层联调文档：`specs/002-m2-shop-points/handlers-status.md` 每处理器 mock 实测结果清单（SC-106 证据）+ 真机抽测上线前置条目

**Checkpoint（quickstart S4）**: 每处理器 1 条 mock 订单全链路闭环；非法参数 422；服务器离线支付前拦截。

---

## Phase 7: US5 — 运营后台最小集（P2）

**目标**: FR-125~130 · SC-107 · quickstart S5。依赖 US1（adjust.ts）/US3（订单与发货）；全部端点 role=admin（布局 requireAdmin 一次覆盖 + API 再校验纵深，越权记审计）。

**Tests（先写先失败）**:

- [x] T044 [P] [US5] 集成：`tests/integration/admin-guard.test.ts` — 未登录 401/user/moderator 403 + `admin_access_violation` 审计（quickstart S5.1） — 实施:guard 拆两层:新增 requireApiAdmin(req) 返回 {ok,status 401|403,code,message} 供全部后台路由统一入口;审计断言 surface/path/role
- [x] T045 [P] [US5] 集成：`tests/integration/admin-products.test.ts` — SKU 保存校验（gameItemId world 不存在 422 `SKU_GAME_ITEM_NOT_FOUND`/服务类未绑处理器 422 `SKU_HANDLER_UNBOUND`/促销价≥原价 422/sku·slug 重复 409/world 不可达 503 拒绝保存）（FR-126） — 实施:fixture 商品为测试期临时数据,重复冲突改为用例内自建冲突对;RUN 后缀 SKU 隔离;vi.mock sku-check 模拟 world 不可达(GameDbError→503)
- [x] T046 [P] [US5] 集成：`tests/integration/admin-orders-users.test.ts` — 补发幂等（幂等键不变）/退款回补（shop_payment 负值流水 remark=「订单退款 #orderNo」+库存回补+状态 refunded+审计含前后余额）/积分手调 402 负余额拦截/徽章重复授予 409（api-admin 契约） — 实施:实施修订:completed→refunded 加入状态机(契约+quickstart S5.4 优先,data-model §3 已注记);退款流水为 shop_payment 正向回补(负值违反 SUM 不变式),remark=「订单退款 #orderNo」照录;低库存=应用层 stock≤threshold(R3 推导)

**实现**:

- [x] T047 [US5] 后台布局守卫：`src/app/admin/layout.tsx` requireAdmin() + 后台导航（低库存/`delivery_failed` 计数标记，FR-128 提醒） — 实施:布局含 ADMIN_NAV 五入口+低库存(amber)/发货异常(red)计数角标;总览页 4 卡片(含迁移复核待办计数,页面 US6 落地)
- [x] T048 [US5] `services/catalog/admin.ts`：商品/分类管理服务（保存校验接 sku-check+resolveHandler；上下架/目录隐藏/低库存查询 stock≤threshold） — 实施:分类管理并入本文件(listAdminCategories/saveCategory);creditLedger 拆出 creditLedgerDetailed(BadgeGrant.pointTransactionId 回引流水)
- [x] T049 [US5] 页面 + API：`/admin/products`（列表/新建/编辑）、`/admin/categories`；POST·PATCH `/api/admin/products`、`/[id]/status`、GET `?lowStock=1`（契约照录 api-admin.md） — 实施:全部后台变更路由统一 requireApiAdmin 前置;zod 边界校验(宪法 VI);GameDbError→503 拒绝保存
- [x] T050 [US5] `services/orders/admin.ts`：订单状态筛选列表/补发（redeliver：逐失败行重发，幂等键不变，审计 `order_redeliver`）/退款（refund：前置 paid|delivery_failed|completed，回补积分+库存+refunded+审计 `order_refund`）；D3 复核 resolve 服务（approve→completed/驳回→cancelled，FR-129） — 实施:照录;resolveMigrationReview 存量单走 updateMany 条件守卫(notIn refunded/cancelled 防覆盖终态)
- [x] T051 [US5] 页面：`/admin/orders`（筛选）+ `/admin/orders/[id]`（详情/补发/退款入口） — 实施:补发/退款入口仅按状态条件渲染,window.confirm 二次确认
- [x] T052 [US5] `services/users-admin/`：用户模糊搜索分页；积分手调 API（接 US1 `points/adjust.ts`）；徽章 CRUD+授予（`badge_reward` 流水 amount 读 point_rule event=badge_grant，重复 409） — 实施:points-adjust 响应偏差:契约 {balance,transactionId},实际 {balance}(adjust 流水 id 未回传,流水可审计追溯;UI 无需)
- [x] T053 [US5] 页面：`/admin/users` + `/admin/users/[id]`（积分手调/徽章授予入口，FR-130） — 实施:用户详情含徽章/近 10 条流水;手调增减双按钮同一 reason 输入
- [x] T054 [US5] 邀请码后台：`/admin/invitation-codes` 批量生成（count 1-200）/列表（状态/已用次数/使用者）/启停 PATCH——复用 M1 invitation_code 表与状态机（M1 spec 遗留能力，注册侧消费仍后置） — 实施:随机段≥4 校验、字符表去易混字符(M1 规则复用);expired 不落库实时推导
- [x] T055 [US5] E2E：`tests/e2e/admin.spec.ts` — 非管理员 403；商品新建合法+非法 SKU；失败订单补发→completed；积分手调流水断言（SC-107） — 实施:越权场景实测为 middleware edge 层拦回 /login?next=(RSC 深校验 redirect /+审计由集成覆盖);E2E 4 场景全绿

**Checkpoint（quickstart S5）**: 越权 0 成功全审计；非法 SKU 0 通过；退款/补发/手调全留痕。

---

## Phase 8: US6 — 商城存量数据迁移（P3）

**目标**: FR-131~133 · SC-105/108 · quickstart S6。依赖 US1（D7 补录）/US5（复核清单 UI）；S6 前两项为开发期验收门，全项待测试环境数据到位。

**Tests（先写先失败）**:

- [ ] T056 [P] [US6] 集成：`tests/integration/migrate-shop-import.test.ts` — seed 临时库首跑断言（商品 99/分类 14/订单按 D3 口径分布：有扣分+发货标记→completed、金额不符→复核清单、无扣分→cancelled）；**幂等重跑零新增行**（legacyWp* 键断言，验收红线）
- [ ] T057 [P] [US6] 集成：`tests/integration/migrate-points.test.ts` — D7：每户 balance=存量 mycred_default；差额户补 `manual_adjust`（remark=「迁移对账调整(D7)」）；全量重算差异=0；M1 已迁流水 refType 幂等去重（quickstart S6.3）

**实现**:

- [ ] T058 [US6] `scripts/migrate/shop-import.sql`：WP dump 临时库→分类→商品（SKU 校验失败→draft+清单不阻塞）→订单（D3 清洗，绑定角色自订单 meta 还原）→订单行快照；全部 INSERT…ON DUPLICATE KEY / 幂等跳过（data-model §7）
- [ ] T059 [US6] `scripts/migrate/import-points.mjs`：存量流水 11,017 笔 6 类枚举映射导入（refType+refId=wp log id 幂等键）→ D7 差额补录 → 接 US1 reconcile 全量对账输出报告
- [ ] T060 [US6] `scripts/migrate/cos-upload.mjs`：uploads 扫描→sha256 幂等上传（重复跑零上传）→ image_asset_map 回填→死链扫描报告（FR-132；cos.* 配置经 lib/config 走 system_config）
- [ ] T061 [US6] `services/images/rewrite.ts`：前台富文本/图集 URL 重写（image_asset_map）+ COS 不可用占位图回退不白屏（Edge Cases）
- [ ] T062 [US6] 复核清单后台：`/admin/review-items` 页面 + GET/POST `/api/admin/review-items[/id]/resolve`（approve→completed/驳回→cancelled，审计留痕，data-model §2.9）
- [ ] T063 [US6] 迁移演练（seed 临时库全流程）：shop-import→import-points→对账差异清零→cos-upload 幂等重跑零上传→抽样 20 户前端一致；演练报告记入 `specs/002-m2-shop-points/migration-report.md`

**Checkpoint（quickstart S6）**: 幂等重跑零新增；D7 抹平后差异清零；图片抽样可达死链归零（SC-105/108）。

---

## Phase 9: Polish（横切收尾）

- [ ] T064 路由兼容复查：`tests/e2e/route-compat.spec.ts` 扩充 /shop /cart /checkout /my-account 断言（FR-109，301/200 链路）
- [ ] T065 性能核对：`/shop` 列表 P95<500ms、结账提交 P95<1s（不含发货，本地 profile 记录，不设 CI 门）
- [ ] T066 审计与安全复查：M2 全部敏感操作审计覆盖率核对（ownership_violation/admin_access_violation/order_redeliver/order_refund/points_adjust/越权补发退款）；日志与错误响应无凭据（宪法 VI）；COS secretKey 不出现在任何响应
- [ ] T067 收尾与状态流转：AGENTS/README M2 段落；development-plan.md M2 状态更新；飞书需求池 M2 条目状态同步；**上线前置清单文档化**（真机 SOAP 联调、每处理器真机抽测、SC-001 玩家真实登录）

**Final Checkpoint**: quickstart S1-S5 全绿 + S6 前两项；SC-101~108 对照表核销；make check 全绿。

---

## 依赖与执行顺序

```text
Phase 1 (Setup)
  └─▶ Phase 2 (Foundational: T004 US0归位 → T005 → T006 → T007~T009 可并行)
        ├─▶ US1 积分账本 (T010-T016)          ──┐
        ├─▶ US2 商城浏览购物车 (T017-T026)      ──┤ 可与 US1 并行(文件零交集)
        │                                       ▼
        │              US3 结账发货闭环 (T027-T036)  ← US1+US2
        │                    ├─▶ US4 服务处理器 (T037-T043)
        │                    └─▶ US5 运营后台 (T044-T055) ← US1+US3
        │                          └─▶ US6 存量迁移 (T056-T063) ← US1+US5
        └─▶ Phase 9 Polish (T064-T067，收尾)
```

**并行示例**（同阶段无依赖、文件不交集）：

```text
# Foundational 完成后:
Agent A: T010+T011 → T012-T016 (US1, services/points/*)
Agent B: T017+T018 → T019-T026 (US2, services/catalog+shop/cart+页面)
# US3 内测试先行:
T027 / T028 / T029 三测试文件可并行编写后逐个实现
```

## MVP 建议与增量交付

1. **首个可交付增量 = Phase 1+2+US1（T001-T016）**：积分域独立可验（S1 全绿），账务地基先行
2. **第二增量 = US2**：商城前台可浏览可加购
3. **第三增量 = US3**：SC-101 核心锚点达成，营收链路可演示（mock 通道）
4. US4/US5/US6 按优先级推进；每 US 结束 make check 全绿 + Checkpoint 场景复验后分批提交

## 验收门（重申）

- 开发期：quickstart S1-S5 全绿 + S6 前两项（幂等导入+D7 对账）
- S6 全项（真实存量数据+图片上 COS）待测试环境数据到位后执行
- **真机联调（worldserver 对接、命令名核对、每处理器真机抽测）= 上线前置清单，不在本里程碑验收门内**（2026-10-24 决策）
