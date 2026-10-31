# Data Model: M2 营收 — 积分体系 + 商城全链路 + 后台最小集

**Feature**: specs/002-m2-shop-points | **Date**: 2026-10-24
**库**: acore_portal（业务库，Prisma migrations 唯一真相源）；游戏四库零 DDL（world 仅 SELECT 校验）
**M1 既有复用**: User / InvitationCode / InvitationCodeUse / PointAccount / PointTransaction / UserToken / MailOutbox / SoapCall / AuditLog / RouteMap / SystemConfig

---

## 1. 枚举扩展（变更既有）

### 1.1 PointTxType（point_tx_type）——M1 仅 register_reward，扩展为 6 类

| 值 | 映射旧 ref | 方向 | 触发 |
|---|---|---|---|
| `register_reward` | registration | + | 注册奖励（M1 已用） |
| `badge_reward` | badge_reward | + | 徽章授予（后台） |
| `shop_payment` | woocommerce_payment | − | 商城结账扣减（固定账务路径） |
| `manual_adjust` | manual | ± | 管理员手动调整/迁移对账调整（D7） |
| `recurring` | recurring | + | 定期发放（仅迁移存量入账；运行期不自动产生，见 spec Assumptions） |
| `visitor_referral` | visitor_referral | + | 访问推荐（仅迁移存量入账） |

### 1.2 UserRole（user_role）：`user | admin` → `user | moderator | admin`

moderator 为 M3 论坛预留；M2 仅要求守卫识别（moderator ≠ admin，不可访问后台）。

### 1.3 新增枚举

- `ProductType`（product_type）：`game_item | service`
- `ProductStatus`（product_status）：`draft | published`
- `OrderStatus`（order_status）：`pending | paid | delivering | completed | delivery_failed | cancelled | refunded`
- `OrderItemDeliveryStatus`（order_item_delivery_status）：`pending | delivered | failed`（skipped 不需要——退款回补不重发）

---

## 2. 新增模型

### 2.1 ProductCategory（product_category）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| name | VarChar(64) | 存量 14 分类名 |
| slug | VarChar(64) unique | URL 段 |
| parentId | BigInt? | 自关联（存量平铺，全部 null；留树扩展） |
| sort | Int | 列表排序 |

索引：`(parentId)`。

### 2.2 Product（product）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| type | ProductType | 物品类/服务类 |
| sku | VarChar(64) unique | `itemsend_{游戏物品ID}` 或处理器键；保存时校验（FR-126） |
| name | VarChar(128) | |
| slug | VarChar(128) unique | 详情 URL |
| description | Text | |
| categoryId | BigInt FK→ProductCategory | |
| status | ProductStatus | draft/published |
| listed | Boolean default true | 目录可见性（false=直链可访问，FR-127） |
| price | Int | 原价（积分） |
| salePrice | Int? | 促销价 |
| saleStart / saleEnd | DateTime? | 促销档期（null=不限端） |
| stockEnabled | Boolean default false | 库存管理开关 |
| stock | Int? | 库存量（enabled 时必填；0=售罄，推导态） |
| lowStockThreshold | Int? | 低库存阈值 |
| gameItemId | Int? | 物品类：acore_world.item_template.entry（存在性校验） |
| legacyWpProductId | Int? unique | 存量映射（幂等导入键，未迁移为 null） |
| createdAt / updatedAt | DateTime | |

索引：`(categoryId, status)`、`(status, listed)`。
**约束**：type=game_item ⇒ gameItemId 非空且 world 库存在；type=service ⇒ sku 必须命中处理器注册表（应用层校验，FR-126）。促销价须 < 原价。

### 2.3 CartItem（cart_item）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| userId | BigInt FK→User | 级联删除 |
| productId | BigInt FK→Product | |
| qty | Int ≥1 | |
| params | Json | 下单参数：`{ characterGuid?, restoreItemEntry?, destAccount?, guildName?, unlockName? }`（按 SKU 参数矩阵，research R5/规格 §5.6） |

无唯一约束（同商品不同参数=独立行；同参数合并为应用层行为）。索引：`(userId)`。
**约束**：params 必须经处理器 validate schema 校验后才可入车（未选恢复物品不得加购，FR-120）。

### 2.4 Order（`order` 表名规避保留字 → `@@map("shop_order")`）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| orderNo | VarChar(32) unique | 展示单号，生成规则 `M2{YYYYMMDD}{6位序列}` |
| userId | BigInt FK→User | |
| status | OrderStatus | 状态机见 §3 |
| pointCost | Int | 积分总额（结算时刻生效价×数量） |
| paidAt / deliveringAt / completedAt / cancelledAt / refundedAt | DateTime? | 状态时间戳（审计链） |
| deliveryError | VarChar(255)? | 最近一次失败摘要（详情展示，全文在 soap_call） |
| legacyWpOrderId | Int? unique | 存量映射（幂等导入键） |
| createdAt / updatedAt | DateTime | |

索引：`(userId, createdAt)`、`(status)`。

### 2.5 OrderItem（order_item）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | **发货幂等键**（research R2/R12） |
| orderId | BigInt FK→Order | 级联 |
| productId | BigInt FK→Product | 商品可下架，行快照不受影响 |
| sku / name | VarChar(64)/(128) | 下单时刻快照 |
| unitPrice | Int | 成交价（生效价快照） |
| qty | Int ≥1 | |
| params | Json | 由购物车行 params 落定（发货处理器读取） |
| deliveryStatus | OrderItemDeliveryStatus | 发货结果回写（FR-118） |
| deliveredAt | DateTime? | |
| soapCallId | BigInt? FK→SoapCall | 最近一次发货审计引用 |
| legacyWpOrderItemId | Int? unique | 存量映射 |

索引：`(orderId)`。

### 2.6 PointRule（point_rule）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| event | VarChar(32) unique | `register` / `badge_grant`（获取类事件） |
| amount | Int >0 | 加分值（register 现值 2） |
| enabled | Boolean | 规则开关 |
| remark | VarChar(128)? | |

消费/手调不经此表（research R10）。**M1 的 `REGISTER_REWARD_AMOUNT` 常量迁移为读此表**（种子数据落 2，保持 M1 行为不变）。

### 2.7 Badge（badge）/ BadgeGrant（badge_grant）

- Badge：id / name VarChar(64) unique / level Int / description VarChar(255)?
- BadgeGrant：id / badgeId FK / userId FK / grantedBy FK→User(操作管理员) / pointTransactionId BigInt? FK→PointTransaction（授予产生的流水回引）/ createdAt；unique `(badgeId, userId)`（每徽章一人一次）

### 2.8 ImageAssetMap（image_asset_map）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| oldUrl | VarChar(512) unique | 旧站 uploads 相对路径或全 URL（归一化） |
| newUrl | VarChar(512) | COS/CDN 地址 |
| fileHash | VarChar(64)? | 幂等上传键（sha256） |
| createdAt | DateTime | |

索引：`(oldUrl)`（unique 覆盖）。前台渲染富文本/图集时经映射表重写（FR-132）。

### 2.9 MigrationReviewItem（migration_review_item，D3 人工复核清单）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| legacyWpOrderId | Int unique | |
| reason | VarChar(128) | 如 `amount_mismatch` |
| detail | Json | 扣分流水 vs 订单金额对比 |
| resolvedAt / resolvedBy | DateTime? / BigInt? | 人工落定后回填 |

复核通过 → 订单落 `completed`；驳回 → `cancelled`（均记审计）。

---

## 3. 订单状态机

```text
pending ──支付事务成功──▶ paid ──发货发起──▶ delivering ──回执成功──▶ completed ──后台退款──▶ refunded（终态B）
                           │                    │                         （US5 实施修订：completed
                           │                    └──回执失败──▶ delivery_failed  非严格终态，api-admin
                           │                                      │ ├─重试/后台补发──▶ delivering  契约+quickstart S5.4
   (cart)                 │                                      │ └─后台退款──────▶ refunded（终态B）  要求可退款）
                           ├──后台取消（未发货）──▶ cancelled（终态C）
                           └──后台退款（已扣分未发货）──▶ refunded（终态B）
```

- `delivering` 为短瞬态：回执落库即离开；进程崩溃后重启时停留在 delivering 的订单由**补发扫描**（对账任务同周期）重新驱动——幂等键保证不重复发货（research R2）
- 回补规则：`cancelled`（未扣库存已扣？——取消只允许在 paid 且未发货：回补积分+库存）；`refunded`（已扣分：回补积分+库存，各产生对应流水/审计）
- 状态迁移集中在一个 state-machine 模块（非法迁移抛错），禁止散落 set

## 4. 积分对账（运行期 + 迁移期）

- **运行期不变式**：任意时刻 `point_account.balance == SUM(point_transaction.amount)`（FR-101，同事务保证）
- **日终对账任务**：全量重算比对 → 差异清单（预期恒空；非空=告警审计，不自动修复）
- **迁移期（D7）**：`balance` 取存量 `mycred_default`；导入流水后逐户补 `manual_adjust`（remark=「迁移对账调整(D7)」）使 SUM=balance；抽样 20 户核对（FR-133）
- **M1 已迁流水去重**：迁移脚本以 `ref_type='legacy_wp_mycred' + ref_id=wp log id` 幂等键跳过已有行（M1 注册奖励流水 refType 需回填统一——迁移脚本兼容 M1 现有 refType 值）

## 5. 并发约束（全部 MySQL 行锁，无应用级锁基建）

| 冲突 | 防线 |
|---|---|
| 余额透支（并发支付） | `UPDATE point_account SET balance=balance-? WHERE user_id=? AND balance>=?`，影响行数=0 即拦截 |
| 库存超卖 | `UPDATE product SET stock=stock-? WHERE id=? AND stock>=?`，同上 |
| 同用户并发多结账 | 用户级事务串行（`SELECT ... FOR UPDATE` 用户行作为互斥点） |
| 发货重复执行 | 幂等键=order_item.id（M1 soap_call 幂等机制复用） |
| 促销价临界 | 结算以服务端 `now()` 判定 effectivePrice，事务内取价 |

## 6. system_config 新增键（配置分域，宪法 VI）

`cos.bucket` / `cos.region` / `cos.secretId` / `cos.secretKey` / `cos.cdnBase`——lib/config.ts schema 扩展 cos 组；COS client 惰性建连（仿游戏库模式）。**凭据值禁止入 env/文档/日志。**

## 7. 迁移脚本（scripts/migrate/，幂等设计）

- `shop-import.sql`：分类→商品→订单→订单行→积分流水/余额（D3/D7），全部按 legacyWp* 键 INSERT … ON DUPLICATE KEY UPDATE 或跳过；SKU 校验失败的物品类商品落 draft+清单
- `cos-upload.mjs`：uploads 扫描 → hash 幂等上传 → image_asset_map 回填 → 死链扫描报告
- 前置：与 M1 用户迁移同套路的 WP dump 临时库；**重跑不产生重复行**（验收红线）
