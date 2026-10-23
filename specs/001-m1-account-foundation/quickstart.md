# Quickstart: M1 地基端到端验证

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-23

> 本文件是 run 手册：实现完成后按 S1-S7 逐场景验证，对应 spec 的 7 条 SC。实现细节见 [data-model.md](./data-model.md) 与 [contracts/](./contracts/api-auth.md)。

## 前置条件

- Node 22 + pnpm + Docker
- `.env` 已从 `.env.example` 复制并填写（dev 默认值可直用）
- dev docker compose 栈就绪：业务 MySQL + Redis + 游戏 schema fixture（acore_auth/acore_characters 结构）+ SOAP mock + Mailpit（research R10）

## 启动

```bash
docker compose -f docker/docker-compose.dev.yml up -d   # 含游戏库结构初始化
pnpm install
pnpm prisma migrate dev                                  # 业务库建表
pnpm db:seed                                             # 合成种子: phpass 存量测试账号/管理员/邀请码
pnpm soap:mock &                                         # SOAP mock(三态开关)
pnpm dev                                                 # http://localhost:3000
```

Mailpit UI（激活/重置邮件捕获）：`http://localhost:8025`

## 验证场景

### S1 新玩家注册全流程 → SC-002

1. 后台生成邀请码（管理员账号登录 `/admin/invitation-codes`，参数：前缀 `m1`/长度 16/上限 1/7 天过期）
2. 退出，用该码走 `/register`：填码+用户名+邮箱（注册页**无密码输入**）
3. Mailpit 收激活邮件 → 链接进入设密页 → 设弱密码被拒 → 设合规密码成功并进入登录态
4. 断言：
   - 业务库 user 存在、`$wp$` bcrypt 格式（cost 12）、邀请码 used_count=1 + use 行存在
   - 游戏 fixture 库 `account` 存在同名账号、`sha_pass_hash = SHA1(UPPER(user):UPPER(pass))`
   - 积分页余额 = +2，流水含"注册奖励"；`SUM(amount) = balance`（账本重算）
   - 同一凭据在站点与（fixture 模拟的）游戏端均验证通过（同密）
   - 全流程 ≤5 分钟

### S2 存量无感登录（双格式）→ SC-001（本地预演）

1. 种子含两种存量测试账号：phpass（公开测试向量）与 `$wp$` bcrypt（research R2——存量精确 3,672 phpass + 2,658 bcrypt）
2. 各用旧密码登录 → 均成功，直接进用户中心
3. 断言：phpass 种子账号 `password_algo` 已变 `bcrypt_wp` 且哈希重写（审计 `hash_upgraded`）；bcrypt 种子账号哈希**原样未动**（零接触）；游戏端 sha_pass_hash 均保持不变（透明升级纯站点侧，明文未变）
4. 再次登录（新哈希路径）成功
5. 正式验收 SC-001：`pnpm verify:sc001`（读不入库的凭据样本文件，100 账号 100% 成功率）——凭据收集为前置任务（research R12）；样本须覆盖双格式账号

### S3 改密/找回双写一致 → SC-003

1. 登录态改密（旧密→新密）→ 站点 + 游戏端均以新密通过
2. 退出，走 forgot-password → Mailpit 收重置邮件 → 30min 内设新密
3. 断言：旧重置链接复用失效（一次性）；旧会话全部吊销（改密后旧 Cookie 不可用）
4. **故障注入**：SOAP mock 切 failure 态再改密 → 断言不产生单边成功、进入可见重试状态、审计有告警；恢复后重试成功

### S4 用户中心 8 页 + 越权 → SC-007

1. 有 3 个角色的测试账号登录 → `/account` 8 页逐一可达
2. 角色页仅本人 3 角色；积分页真实数据；订单页友好空态
3. 物品恢复页选角色 → 仅本人角色可选；直改请求参数传他人 guid → 403 + 审计 `ownership_violation`
4. 未登录直访 `/account/*` → 引导至 `/login`

### S5 邀请码后台 → FR-028/029/030

1. 批量生成 10 个（上限 5/7 天）→ 参数落库正确
2. 消费 1 次后列表：状态实时推导正确、使用者关联可见
3. 停用其中 1 个 → 立即用它注册 → 实时拒绝（不依赖后台刷新）
4. 过期码（把 expires_at 改到过去）注册 → 实时拒绝为 expired

### S6 SOAP 通道 → FR-022/023

1. 正常态执行 `.server info` → 成功返回，`soap_call` success、审计留痕
2. mock 切 timeout → 重试 3 次全部留痕 → failed 可见
3. 同 idempotency_key 重复投递 → 不重复执行，返回首次结果
4. 启动自检：四库连接自检通过；SOAP 未开时应用可启动（degraded 标记）

### S7 旧路由兼容 → FR-025/026/027 + SC-005

1. 访问 `/wp-login.php` → 302 到 `/login`；`?action=register` → `/register`；`?action=lostpassword` → `/forgot-password`
2. 向 route_map 注册测试条目 `p:999 → /account` → 访问 `/?p=999` → 301 到新路径
3. 删除条目后再访 → 404（不做模糊猜测）
4. `/shop` `/cart` `/checkout` `/my-account` → 路径不变（M2 前框架页）

## 提交前门禁（宪法 VIII）

```bash
make check    # lint + typecheck + test 全绿
```

测试构成：phpass 黄金向量 / 邀请码状态机 / 账本重算（单测）· 跨库注册回滚 / 会话吊销 / 301 层（集成）· S1/S2/S3/S4 主链路（Playwright E2E）。
