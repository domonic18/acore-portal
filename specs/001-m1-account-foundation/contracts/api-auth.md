# Contract: 认证链路 API（api-auth）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-001~FR-015 | 实现层：Next.js Route Handlers（薄层，业务在 `server/services/auth`）

> 通用约定：请求/响应 JSON；边界一律 Zod 校验；错误响应统一 `{ error: { code, message } }`，message 面向用户可读、不暴露内部；成功设 Cookie 的端点返回 200。无特别标注即无需登录态。

## POST /api/auth/register

注册受理（无密码，FR-005）。成功后激活邮件入 outbox。

- **Request**: `{ invitation_code: string, username: string, email: string }`
- **校验顺序**（实时、不依赖后台刷新）：邀请码状态机（FR-001/002）→ 用户名格式与 `@`（FR-003）→ 用户名/邮箱两侧占用（FR-004）
- **Response 202**: `{ message }`（受理成功，提示查收邮件；**不区分**"邮箱已存在"以外的信息侧漏场景）
- **Errors**:
  - `422 INVALID_INVITATION_CODE`（附原因：expired / disabled / finish / not_found）
  - `422 USERNAME_TAKEN` / `EMAIL_TAKEN`（任一侧占用同码）
  - `422 VALIDATION_ERROR`（格式问题）
  - `409 USERNAME_CONFLICT`（并发撞号唯一索引兜底，FR-009）
  - `503 GAME_DB_UNAVAILABLE`（游戏库不可用，整体失败，不产生半成品——spec 边缘场景 1）
- **副作用**（跨库事务）：invitation_code 消费 + use 行 + user 行（`password_algo` 待设，占位激活前不可登录）+ acore_auth.account 创建 + 注册奖励流水/余额 + activate token + outbox 邮件。任一失败整体回滚。

> 说明：游戏端账号在注册受理时即创建（同密契约下账号名先占位），设密完成时写入 sha_pass_hash。若 5 分钟未完成激活，token 过期、账号回收（定时清理或设密页校验时标记，实现取简）。

## POST /api/auth/set-password

经激活 token 设密，完成账号创建链路最后一环（FR-005/006/007）。

- **Request**: `{ token: string, password: string }`
- **校验**: token 有效（一次性 24h）+ 密码复杂度（≥8，含字母数字，≠username）
- **Response 200**: `{ message }` + 登录态 Cookie（激活即登录，减少一步摩擦）
- **Errors**: `422 TOKEN_INVALID_OR_EXPIRED`（引导重发）、`422 WEAK_PASSWORD`
- **副作用**: `$wp$` bcrypt 哈希落 user（research R1 方案 Y）；游戏端 sha_pass_hash 写入；token 消费；审计 `account_activated`

## POST /api/auth/login

- **Request**: `{ username: string, password: string, remember?: boolean }`
- **登录路径**（FR-011）：查 user → `password_algo=bcrypt_wp` 直接校验；`phpass` 存量按 research R2 校验（`$P$` 迭代 MD5）→ 通过后重哈希为 `$wp$` bcrypt（cost 12）写回 + 审计 `hash_upgraded`（一人一次，透明；纯站点侧操作，不触碰游戏端；`bcrypt_wp` 用户零接触）
- **Response 200**: `{ user: { username, nickname, role } }` + HttpOnly Cookie（access JWT 2h；`remember=true` 另发 30d 轮换 refresh）
- **Errors**:
  - `401 INVALID_CREDENTIALS`（**统一模糊**，不区分用户不存在/密码错/账号 banned——FR-013；审计记 `login_failed` 含真实原因）
  - `429 RATE_LIMITED`（M1 预留语义，M4 实装限速器）
- phpass 校验异常（哈希损坏）：同 `401`，响应文案附"找回密码"引导（spec 边缘场景 4），不锁账号

## POST /api/auth/logout

- **Response 204**；吊销当前会话（Redis session 删除 + Cookie 清除）

## POST /api/auth/forgot-password

- **Request**: `{ email: string }`
- **Response 202**: `{ message }`（**恒定响应**，不泄露邮箱是否存在——FR-013 同源）
- **副作用**: 存在则建 `password_reset` token（30min）+ outbox；不存在仅审计
- **频率限制**: 同邮箱 ≥60s 间隔、≤5 次/天（Redis 计数）

## POST /api/auth/reset-password

- **Request**: `{ token: string, password: string }`
- **校验**: token 一次性 30min + 密码复杂度
- **Response 200**: `{ message }`
- **副作用**: **双写** `$wp$` bcrypt + 游戏端 sha_pass_hash（FR-014）；吊销全部既有会话；token 消费；审计 `password_reset`
- **双写失败语义**: 游戏端写失败 → 变更不标记完成，user 侧留待重试状态 + 审计告警（进可见重试，禁止单边成功——FR-014）；站点侧新哈希仅在实际双写成功后生效

## POST /api/account/change-password（登录态）

- **Request**: `{ current_password: string, new_password: string }`
- **校验**: 当前密码验证 + 新密码复杂度
- **Response 200**: `{ message }`
- **副作用**: 同 reset-password 的双写/吊销/审计语义

## POST /api/account/change-email（登录态）

- **Request**: `{ new_email: string, current_password: string }`
- **Response 202**: 验证邮件入 outbox（发往新邮箱）
- **副作用**: `email_change` token（payload=新邮箱）；点击邮件链接 → `POST /api/account/confirm-email { token }` 生效（FR-021）；占用查重在 confirm 时刻再验一次
