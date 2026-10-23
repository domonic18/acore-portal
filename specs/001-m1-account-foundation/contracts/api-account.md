# Contract: 用户中心 API（api-account）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-016~FR-021 | 实现层：页面数据面以 RSC 服务端直读为主，下列 Route Handlers 仅服务客户端交互（变更类 + 客户端翻页/懒加载）。

> 通用约定：全部要求登录态（未登录 401 → 前端引导 `/login`，FR-016/边缘场景 4）；**一切角色/积分数据服务端强制按当前会话用户过滤**（FR-017，越权 0 成功——SC-007）；错误响应同 api-auth 约定。

## 页面路由（RSC 数据面）

| 路由 | 页面 | 数据来源 |
|------|------|----------|
| `/account` | 概览 | user + 角色计数 + 最近积分流水 + 最近动态 |
| `/account/characters` | 我的角色 | characters 只读投影（`account=本人`服务端过滤） |
| `/account/points` | 积分 | point_account + point_transaction 分页 |
| `/account/orders` | 订单 | M1 空态框架页（无数据依赖） |
| `/account/item-restore` | 物品恢复 | 角色 + 可恢复物品列表（只读；数据面 M1 从游戏库查询，执行入口 M2 开放） |
| `/account/raf` | RAF 招募 | 只读展示（M1 展示框架与说明，数据 M2 接入则空态） |
| `/account/settings` | 账户设置 | user（昵称/邮箱/密码变更入口） |
| `/account/address` | 收货地址 | M1 空态框架页（地址簿实体 M2 随商城落地） |

> 8 页全部可达为 SC-007 组成部分；空态页必须呈现友好占位而非 404（FR-018，spec US4 场景 2）。

## PATCH /api/account/profile（登录态）

- **Request**: `{ nickname?: string }`（M1 昵称；邮箱走 change-email 独立流程）
- **Response 200**: `{ user }`
- **校验**: nickname 长度 2-64

## GET /api/account/characters（登录态）

- **Response 200**: `{ characters: [{ guid, name, race, class, level, gender, online }] }`
- 服务端经会话 → 游戏账号 id → `characters.account = id` 过滤；无角色返回空数组
- **Errors**: `503 GAME_DB_UNAVAILABLE`（角色库不可达，页面骨架 + 重试提示，不白屏）

## GET /api/account/points?page=（登录态）

- **Response 200**: `{ balance: number, transactions: [{ id, type, amount, balance_after, remark, createdAt }], page, totalPages }`
- 数据源即最小账本；余额展示失败时不得伪造 0，走错误态

## GET /api/account/restore-items?guid=（登录态，只读）

- **Request**: `guid` 为本人名下角色（服务端校验归属，非本人 → `403`，FR-017 + 审计 `ownership_violation`）
- **Response 200**: `{ items: [{ entry, name, quality, count }] }`（M1 只读列表，来源角色库/恢复列表，M2 接执行）
- **Errors**: `403 CHARACTER_NOT_OWNED` / `503 GAME_DB_UNAVAILABLE`

## GET /api/account/raf（登录态，只读）

- **Response 200**: `{ recruited: [], total: 0 }`（M1 结构就绪空态）

## 鉴权实现约定

- RSC 页面与 Route Handlers 统一经 `getSession()`（HttpOnly Cookie → JWT 验签 → Redis 会话存在性校验，支持吊销）
- `remember` refresh 轮换在中间件完成（单次有效，重放即全吊销——research R4）
- `role=admin` 之外访问 `/admin/*` → 403 + 审计
