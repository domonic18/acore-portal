# Contract: 商城前台 API（api-shop）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-108~FR-121 | 实现层：`/shop`、`/shop/[slug]`、`/cart`、`/checkout`、`/account/orders` 页面数据面以 RSC 服务端直读为主，下列 Route Handlers 服务客户端交互（加购/改数/结账提交/订单懒加载）。

> 通用约定：错误响应结构同 M1 api-auth 约定（`{ error: { code, message } }`）；登录态判定同 `getSession()`；一切价格在服务端以 `effectivePrice(now)` 判定（FR-115），前端展示价不可信。

## 页面路由（RSC 数据面）

| 路由 | 页面 | 数据来源 |
|------|------|----------|
| `/shop` | 商品列表 | product+category（published+listed 过滤；分类/排序/分页 query） |
| `/shop/[slug]` | 商品详情 | product 单条 + 分类 + Wowhead 标注（物品类）+ 角色下拉（登录态） |
| `/cart` | 购物车 | cart_item join product（登录态） |
| `/checkout` | 结账确认 | 购物车行 + 收货人（=会话用户）+ 积分余额 + 参数复核 |
| `/account/orders` | 订单列表 | order 分页（userId 过滤） |
| `/account/orders/[id]` | 订单详情 | order + order_item（归属校验） |

`/shop` `/cart` `/checkout` `/my-account` 旧路径不变（FR-109）；`/my-account` 由 M1 legacy 层 301 到 `/account`。

## GET /api/shop/products（公开）

- **Query**: `category?`（slug）/ `sort?`（`price_asc | price_desc | newest`，默认 newest）/ `page?`（默认 1，size 24）
- **Response 200**: `{ items: [{ id, slug, name, type, price, effectivePrice, onSale, categoryName, image }], page, totalPages }`
- 仅返回 `status=published`；`listed=false` 不出现在列表（直链可达，FR-127）

## GET /api/shop/products/[slug]（公开）

- **Response 200**: `{ product: { ..., gameItemId?, stockEnabled, stock?, effectivePrice, onSale }, categories }`
- 下架（draft）商品直链 → `404`；`listed=false` 直链正常返回（附"已下架"标记）

## POST /api/cart（登录态）

- **Request**: `{ productId, qty?, params?: { characterGuid?, restoreItemEntry?, destAccount?, guildName?, unlockName? } }`
- **校验链**（服务端）：商品 published → SKU 参数矩阵 schema 校验（缺参数/非法参数 `422 PARAM_INVALID`，FR-120 未选恢复物品不得加购）→ 角色归属（`403 CHARACTER_NOT_OWNED`+审计）→ 售罄拦截（`409 OUT_OF_STOCK`）→ 同商品同参数合并行
- **Response 200**: `{ cartCount }`

## PATCH /api/cart/[id] / DELETE /api/cart/[id]（登录态，仅本人行）

- PATCH：`{ qty }`（≥1；售罄商品 qty 增加被 `409` 拦截）
- DELETE：移除行
- **Errors**: `404` 非本人行不存在（不区分"他人行"，防枚举）

## POST /api/checkout（登录态）

- **Request**: `{ }`（全量按当前购物车结算；确认页参数复核仅为前端展示，服务端以购物车行为准）
- **单事务**（research R2）：条件扣余额（不足 `402 INSUFFICIENT_BALANCE`，拦截不建单）→ 建 Order(paid)+OrderItem → 条件扣库存（超卖 `409 OUT_OF_STOCK` 回滚）→ shop_payment 流水 → 清已结购物车行
- **Response 200**: `{ orderId, orderNo }`；事务外异步发货（SOAP，幂等键=order_item.id）
- **Errors**: `401` 未登录（禁止游客结账，FR-111）/ `402` / `409` / `422` 购物车空或参数失效（商品下架/售罄，提示重审购物车）

## GET /api/account/orders?page=（登录态）

- **Response 200**: `{ orders: [{ id, orderNo, status, pointCost, itemCount, createdAt }], page, totalPages }`

## GET /api/account/orders/[id]（登录态，仅本人）

- **Response 200**: `{ order: { status, pointCost, paidAt, completedAt, deliveryError? }, items: [{ sku, name, unitPrice, qty, params, deliveryStatus }] }`
- **Errors**: `404` 非本人（防枚举，同上）

## GET /api/account/restore-items?guid=（M1 已有，M2 语义升级）

- M2 起服务装备恢复商品选择器（同源复用，FR-120）；响应与 M1 一致，新增 `restorable: true` 标记与质量色

## 服务端推送（发货状态刷新）

- 订单详情/列表轮询 `GET /api/account/orders/[id]`（30s 间隔，delivering/delivery_failed 态）；不引入 WebSocket/SSE（YAGNI，宪法 VII）
