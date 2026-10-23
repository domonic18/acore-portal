# Contract: 后台邀请码 API（api-admin）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-028~FR-030 / US5 | 实现层：`/admin/invitation-codes` 页面 + Route Handlers；全部要求 `role=admin`（否则 403 + 审计）。

## POST /api/admin/invitation-codes（批量生成）

- **Request**: `{ prefix: string(0-16), length: number(8-32), count: number(1-200), max_uses: number(1-999), expires_in_days?: number|null }`
- **Response 201**: `{ created: [{ id, code, max_uses, expiresAt }] }`
- **规则**: 码值 = prefix + 随机串（去混淆字符集 0-9a-zA-Z 去易混 0O1lI）；唯一冲突重试；参数落库留档（data-model §1.2）
- **审计**: `invitation_codes_generated`（数量/参数，不记码值全量——码值本身按敏感处理视运营需要，M1 从宽记录数量）

## GET /api/admin/invitation-codes?status=&q=&page=

- **Response 200**: `{ items: [{ id, code, status, usedCount, maxUses, expiresAt, createdAt, uses: [{ username, usedAt }] }], page, totalPages }`
- `status` 筛选值为**实时推导结果**（available/disabled/finish/expired），非仅落库字段——列表不出现"已过期仍显示可用"（修复旧系统懒翻转缺陷，FR-002 后台侧同理）
- `q` 模糊匹配码值或使用者用户名

## PATCH /api/admin/invitation-codes/:id（启停）

- **Request**: `{ status: "available" | "disabled" }`
- **规则**: 仅 `available → disabled` 可执行（终态单向，data-model 状态机）；`finish`/已过期码返回 `422` 不可停用变更
- **Response 200**: `{ item }`
- **审计**: `invitation_code_disabled`

## 并发与一致性

- 批量生成单事务；消费侧（注册链路）与本接口启停并发时，以消费事务行锁先到为准，停用后到达的消费请求被拒（US5 场景 3 实时性）
