# Contract: 运营后台 API（api-admin）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-125~FR-130 | 实现层：`/admin/*` RSC 页面 + 变更类 Route Handlers。

> 通用约定：**全部端点要求 `role=admin`**（moderator 403，user 403，未登录 401）；布局层 `requireAdmin()` 一次覆盖 + API 层再校验（纵深，research R7）；一切越权尝试记 `AuditLog`（category 扩展 `admin_access_violation`）；敏感操作（补发/退款/积分手调/徽章授予）全部审计（操作者/对象/前后值）。

## 页面路由（RSC 数据面）

| 路由 | 页面 |
|------|------|
| `/admin/products` / `/admin/products/new` / `/admin/products/[id]` | 商品列表/新建/编辑（SKU 校验/价格促销/库存/上下架/目录隐藏） |
| `/admin/categories` | 分类管理（平铺排序） |
| `/admin/orders` / `/admin/orders/[id]` | 订单列表（状态筛选）/详情（补发/退款入口） |
| `/admin/users` / `/admin/users/[id]` | 用户列表/详情（积分手调/徽章授予入口） |
| `/admin/invitation-codes` | 邀请码列表/批量生成/启停（M1 spec 遗留能力，M2 落地） |
| `/admin/review-items` | D3 人工复核清单（迁移期） |

## 商品管理

### POST/PATCH /api/admin/products

- **Request**: `{ type, sku, name, slug, description, categoryId, price, salePrice?, saleStart?, saleEnd?, stockEnabled, stock?, lowStockThreshold?, gameItemId?, status, listed }`
- **SKU 保存校验**（FR-126，服务端）：`type=game_item` ⇒ gameItemId 在 acore_world.item_template 存在（`422 SKU_GAME_ITEM_NOT_FOUND`）；`type=service` ⇒ sku 命中处理器注册表（`422 SKU_HANDLER_UNBOUND`）；sku/slug 唯一（`409 DUPLICATE`）；促销价<原价（`422 SALE_PRICE_INVALID`）
- **Errors**: `403` 非 admin；world 库不可达 → `503`（拒绝保存而非放行）

### POST /api/admin/products/[id]/status

- `{ status: 'draft' | 'published', listed?: boolean }`——上下架/目录隐藏（FR-127）；下架不影响历史订单行快照

### GET /api/admin/products?lowStock=1

- 低库存列表（`stockEnabled && stock<=lowStockThreshold`）；后台登录后低库存计数在导航标记（提醒，FR-128；M2 不发邮件）

## 订单管理

### GET /api/admin/orders?status=&page=

- 全量订单分页（状态筛选）；`delivery_failed` 计数导航标记

### POST /api/admin/orders/[id]/redeliver

- 对 `delivery_failed` 订单触发人工补发：逐失败订单行重新发起发货（幂等键不变=order_item.id，research R2）；状态 delivering→completed/仍 failed
- **Response 200**: `{ results: [{ orderItemId, deliveryStatus }] }`；审计 `order_redeliver`

### POST /api/admin/orders/[id]/refund

- 前置：status ∈ `paid | delivery_failed | completed`；执行：回补积分（manual_adjust? no—— `refund` 走 shop_payment 反向? 决策：**独立负向流水 type=shop_payment、amount 为负**？—— 不：类型枚举无 refund，用 `manual_adjust`+refType='order_refund' 会混淆账义。**定案：shop_payment 允许正负号（amount=-X，remark=「订单退款 #orderNo」）**，余额回补+库存回补，状态→refunded，审计 `order_refund`（含前后余额）
- 迁移存量退款同理；对账 SUM 不变式保持

## 用户管理与积分

### GET /api/admin/users?query=&page=

- 用户名/邮箱模糊搜索分页

### POST /api/admin/users/[id]/points-adjust

- **Request**: `{ amount: number(±), reason: string(必填, 2-255) }`
- 执行：单事务 `manual_adjust` 流水（remark=reason，refType='admin'，refId=操作管理员 id）+ 余额更新；结果余额可为任意整数（允许调至负数? **定案：禁止负余额**，`402` 拦截）
- **Response 200**: `{ balance, transactionId }`；审计 `points_adjust`（FR-105/FR-130）

### POST /api/admin/users/[id]/badges

- `{ badgeId }` 授予：badge_grant 记录 + `badge_reward` 流水（amount 读 point_rule 表 event=badge_grant，FR-104）；重复授予 `409`（unique 约束）
- CRUD `/api/admin/badges`（name/level/description）

## 邀请码管理（M1 遗留能力落地，spec Assumptions）

### POST /api/admin/invitation-codes/generate

- `{ prefix?, length?, count(1-200), maxUses, expiresAt? }` → 批量生成（复用 M1 invitation_code 表与状态机）

### GET /api/admin/invitation-codes?page= / PATCH /[id]

- 列表（状态/已用次数/使用者关联）；PATCH `{ status: 'available'|'disabled' }` 启停
- 注册侧消费仍后置（M2 注册不启用邀请码，spec Assumptions）

## D3 复核清单

### GET /api/admin/review-items / POST /api/admin/review-items/[id]/resolve

- `{ approve: boolean, note? }`：approve → 订单落 completed；驳回 → cancelled（+库存回补不涉及/积分不动）；审计留痕（data-model §2.9）
