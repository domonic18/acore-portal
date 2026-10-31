# Research: M2 营收 — 积分体系 + 商城全链路 + 后台最小集

**Feature**: specs/002-m2-shop-points | **Date**: 2026-10-24
**输入**: spec.md FR-101~133 / constitution v1.0.2 / docs/research/01 §4-§5（D3/D7）/ 02-功能规格说明书 §4-§6 §12 / 飞书需求池 M2 31 条

---

## R1 订单状态机设计

**Decision**: 7 态枚举 `pending → paid → delivering → completed` 主链 + `delivery_failed`（可重试/可补发）+ `cancelled` / `refunded`（终态，均触发回补）。`delivering` 为短瞬态（SOAP 发起→回执落库期间），回执写入即离开。另设**人工复核清单**（非订单状态）：D3 清洗中"扣分与金额不符"的存量单导入 `completed` 前先入复核表，人工确认后落定——避免污染运行态状态机。

**Rationale**: 修复旧系统 1,895/1,897 滞留 processing 的缺陷 = 发货回执必须驱动状态离开中间态；失败态独立存在使"支付已成功但货未发"可见可补发（宪法 II）。

**Alternatives considered**: ①复用 Woo 状态名（processing/completed/refunded）——语义不清且沿用缺陷命名，弃；②无 delivering 态（paid 直接→completed）——回执异步到达时无法区分"未发/在发"，幂等核对困难，弃。

## R2 支付-发货两阶段一致性

**Decision**: 阶段一（单 MySQL 事务）：条件扣余额（`UPDATE point_account SET balance=balance-? WHERE user_id=? AND balance>=?`，行锁防透支）→ 创建 Order(paid) + OrderItem → 条件扣库存（`UPDATE product SET stock=stock-? WHERE id=? AND stock>=?`，防超卖）→ 写扣分流 水。任一失败整体回滚。阶段二（事务外）：逐订单行发起 SOAP 发货（幂等键=订单行 ID），回执写 `order_item.delivery_status` 并推进订单状态；发货前状态置 `delivering`。

**Rationale**: 支付三要素必须原子（账实一致，宪法 III）；发货必须事务外（SOAP 是慢外部调用，入事务会长持锁且失败回滚已扣积分违背"扣分已发生则账实一致"）。幂等键复用 M1 soap_call 幂等机制：同键重复提交命中已有回执不重复执行。

**Alternatives considered**: ①发货入事务——长事务+外部调用不可回滚，弃；②Saga 补偿（发货失败自动退积分）——自动退款会让"短暂网络抖动"变成资金变动，且与"失败可见人工补发"诉求相反，弃（退款仅人工经后台，FR-129）。

## R3 库存模型

**Decision**: `product.stock_enabled` + `stock Int?` + `low_stock_threshold Int?`。缺货判定由 `stock_enabled && stock<=0` **推导**，不落独立状态字段（避免双写漂移）；扣减走条件 UPDATE；取消/退款回补为普通 UPDATE；低库存提醒=后台列表标记+审计事件（M2 不接邮件通知，订单邮件已取消）。

**Rationale**: 现状 18 个限量坐骑 0-2 件，规模小、竞争低，行锁条件更新足够；推导态消除"库存=0 但状态未翻转"类不一致。

**Alternatives considered**: 独立 inventory 表+流水——为未来可能的多仓/占货预留，当前 6K 规模 YAGNI，弃（已在表结构留 stock 语义，后续可拆）。

## R4 促销价模型

**Decision**: `price Int`（原价，积分）+ `salePrice Int?` + `saleStart/saleEnd DateTime?`。生效价函数 `effectivePrice(p, now)`：`salePrice` 存在且 `now∈[saleStart,saleEnd]`（null 边界=不限定）则促销价否则原价；结算一律调此函数（服务端时刻为准）。前台划线价展示=同函数判定。

**Rationale**: 存量 97/99 商品设过促销价、档期未用过——双价+可选档期恰好覆盖且不过度设计。

## R5 服务类处理器注册表与命令映射

**Decision**: `server/services/shop/handlers/` 下每处理器一文件，统一接口 `{ skuKey, validate(params, ctx), execute(item, ctx) }`，注册表 `Map<skuKey, Handler>`；路由规则：SKU=`itemsend_{id}` 前缀路由到 ItemSendHandler（含幻化单件/套装等以物品为载体的服务），精确键（`item-restoration`/`char-change-race`/`char-change-faction`/`char-change-customize`/`char-change-name`/`char-transfer`/`char-clone`/`guild-change`/`name-unlock`）精确匹配。命令经 M1 SOAP 层执行；AzerothCore 侧命令名（send items / character changerace / changerace / customize / rename 等）在 US4 实现时以 soap-mock 契约先行固化、真机联调时核对修订（真机延后已决策）。

**Rationale**: 策略模式 = spec FR-122 明确要求；前缀+精确双路由兼容存量 99 商品 SKU 形态。装备恢复复用 M1 recovery_item 数据源与 `/api/account/restore-items` 同源接口（同源铁律）。

**Alternatives considered**: 每商品配一条命令模板（数据驱动）——存量服务语义差异大（目标账号/公会名等专属校验），数据驱动会把逻辑挤进配置字符串，弃。

## R6 购物车存储

**Decision**: 业务库 `cart_item` 表（userId, productId, qty, params Json）。未登录不存购物车（加购即引导登录，FR-111）；同用户同商品同参数加购=合并行数量，参数不同=独立行（应用层合并，不加 DB 唯一约束）；结账成功后清除对应行。

**Rationale**: 登录后才可结算（角色参数必须落库），DB 表天然支持跨设备与订单行参数溯源；6K 规模无热点读写压力，不需要 Redis。

**Alternatives considered**: Redis hash——会话数据易失且与订单行参数审计链脱节，弃。

## R7 RBAC 与后台守卫

**Decision**: `UserRole` 枚举扩展 `moderator`（M3 论坛用，M2 仅落枚举+守卫识别）；后台守卫= `(admin)` 路由组 layout 层 `requireAdmin()` 一次覆盖（仿 M1 `(account)` 布局 requireSession 深校验模式），API 层再校验（纵深）；越权记审计（AuditLog 现有 category 扩展）。

**Rationale**: 复用 M1 已验证的布局级守卫模式；版主角色现在落枚举避免 M3 再迁移。

## R8 图片资产与 COS

**Decision**: 腾讯云 COS（cos-nodejs-sdk-v5）。配置入 system_config：`cos.bucket/region/secretId/secretKey/cdnBase`（凭据入配置表，宪法 VI v1.0.2）。迁移脚本 `scripts/migrate/cos-upload.mjs`：扫描旧站 uploads 目录 → 幂等上传（按文件 hash 跳过已传）→ 回填 `image_asset_map(old_url→new_url)`；前台/富文本渲染经映射表重写旧 URL；死链扫描脚本核对映射覆盖。读取走 CDN 公开桶+回源，不签名（商品图非敏感）。

**Rationale**: 用户已定 COS 直接入 M2（不做本地代理过渡）；4.4G/972 附件一次性脚本迁移+映射表查询重写是最小方案。

**Alternatives considered**: 应用运行时代理旧 URL——长期依赖旧存储、切换日风险大，弃；Sharp 压缩流水线——增值项非必需，弃（YAGNI）。

## R9 存量迁移与 D3/D7 落地

**Decision**: 沿用 M1 用户迁移套路（WP dump → 服务器本地临时库 → `scripts/migrate/shop-import.sql` INSERT SELECT，幂等可重跑）：
- 商品/分类直接映射导入，SKU 过 world 库存在性校验（校验失败的物品类商品导入为 `draft` 并记清单，不阻塞整体）
- 订单按 D3：有 woocommerce_payment 扣分流水+发货标记 → `completed`；扣分与金额不符 → 复核清单；无扣分 → `cancelled`；订单行 `acore_char_sel` 等 meta 还原进 params Json
- 积分（D7 基准）：`point_account.balance` 直接取存量 `mycred_default`；11,017 笔流水按 FR-103 枚举映射导入；每户 `差额 = 存量余额 - SUM(导入流水)`，非零则补一条 `manual_adjust` 流水（remark=「迁移对账调整(D7)」，balanceAfter=存量余额）——抹平后全局满足"余额=流水"
- M1 已迁的 5,643 用户含其注册奖励流水——迁移脚本须与已有 point_transaction 去重（幂等键=refType+refId 或 wp log id 映射）

**Rationale**: D3/D7 已裁决（2026-10-24）；SQL 批量导入与 M1 验证过的路径同源，风险最低。

**Alternatives considered**: 逐条 API 导入——1,897 订单×多条目性能差且事务管理复杂，弃；以流水重算为准——被 D7 否决。

## R10 积分流水类型扩展与规则表

**Decision**: `PointTxType` 扩展为 6+1：`register_reward`(已有) / `badge_reward` / `shop_payment` / `manual_adjust` / `recurring` / `visitor_referral`（+迁移映射表记录旧 ref→新枚举）。获取类（register/badge）经 `point_rule` 表驱动（event→amount，enabled 开关）；`shop_payment` 扣减与 `manual_adjust` 为固定账务路径不经规则表（spec FR-104）。

**Rationale**: 规则表只管"获取类"符合现状（获取规则变化频率低、消费/手调是固定语义）；枚举一一映射保迁移对账可执行。

**Alternatives considered**: 全类型规则化——过度设计，扣分路径规则化反而危险（改规则影响资金安全），弃。

## R11 Wowhead 浮窗

**Decision**: 布局层引入 Wowhead 官方 tooltip 脚本（static.wowhead.com/widgets），物品元素按 `data-wowhead` 约定标注 `item={gameItemId}`；脚本加载失败/被墙时元素自然降级为纯文本（不做自建浮窗）。仅物品类商品详情启用。

**Rationale**: 零自建成本、玩家熟悉原站体验；降级路径天然存在。

## R12 结账并发与幂等控制

**Decision**: 并发安全全部下沉到单事务内的条件 UPDATE（余额/库存双条件，见 R2）；订单提交接口按用户级互斥（同一用户并发多结账请求串行化，应用锁/事务冲突重试）；幂等键只用于发货（订单行 ID 天然唯一），订单创建本身不设幂等键（前端表单一次性提交+重复点击由购物车行清除兜底）。

**Rationale**: 6K 规模下单并发极低，MySQL 行锁是最简单正确解；用户级互斥防"双开页同时结账双扣分"。

**Alternatives considered**: Redis 分布式锁——引入新基础设施，单体 MySQL 足够，弃（宪法 VII）。
