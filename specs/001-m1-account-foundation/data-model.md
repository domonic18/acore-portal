# Phase 1 Data Model: M1 地基 — 账号全链路 + 游戏集成 + 路由兼容

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

> 命名约定遵循 AGENTS.md：业务库表/字段 snake_case，Prisma model PascalCase + `@@map`；枚举进 `src/constants/`。业务库 schema 由 Prisma migrations 管理（唯一真相源）；游戏库仅 introspect，字段以 AzerothCore 现状为准，本文件仅标注 M1 触碰面。

## 1. 业务库 `acore_portal`（Prisma 管理）

### 1.1 user（站点用户）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| username | VARCHAR(32) | **UNIQUE**，禁 `@` | = 游戏账号名（铁律①）；存量迁移保留原名 |
| email | VARCHAR(255) | **UNIQUE** | |
| password_hash | VARCHAR(255) | NOT NULL | 存 `$wp$` bcrypt 串（目标格式，research R1 方案 Y）；存量 `$P$` 哈希为迁移中间态（见 password_algo） |
| password_algo | ENUM | NOT NULL | `phpass` / `bcrypt_wp`（存量双格式，research R2；方案 Y 后 argon2id 不再使用）；登录路径判定依据，`$P$` 用户首登后置 `bcrypt_wp` |
| nickname | VARCHAR(64) | NULL | 展示名；NULL 时前端回退 username |
| role | ENUM | NOT NULL DEFAULT `user` | `user` / `admin`；M1 仅用于后台邀请码页鉴权（不设独立 admin 表，YAGNI） |
| status | ENUM | NOT NULL DEFAULT `active` | `active` / `banned` |
| register_code_id | BIGINT FK | NULL → invitation_code.id | 注册所用邀请码关联（FR-008 双向完整） |
| wp_user_id | INT | NULL, **UNIQUE** | WP 迁移来源标记；M3 迁移时填充，M1 仅建列 |
| created_at / updated_at | DATETIME | NOT NULL | |

**校验规则**（Zod schema 于 API 边界 + 服务层复用）：
- username：`/^[A-Za-z0-9_一-龥]{2,32}$/` 且不含 `@`（FR-003）；注册时两侧查重（FR-004）
- email：标准 RFC 简化校验 + 两侧查重
- password（FR-006）：长度 ≥8 且须含字母与数字；拒绝与 username 相同

**并发约束**：`username`/`email` 唯一索引为撞号最终防线；冲突捕获翻译为可读文案（research R9）。

### 1.2 invitation_code（邀请码）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| code | VARCHAR(64) | **UNIQUE** | 码值 |
| prefix / length / max_uses | VARCHAR(16) / INT / INT | NOT NULL | 生成参数留档（FR-028） |
| used_count | INT | NOT NULL DEFAULT 0 | 与 invitation_code_use 行数一致性由事务保证 |
| expires_at | DATETIME | NULL | NULL = 永不过期；**过期在消费时刻判定**（FR-002） |
| status | ENUM | NOT NULL | `available` / `disabled` / `finish` |
| created_by | BIGINT FK | → user.id | 生成管理员 |
| created_at / updated_at | DATETIME | NOT NULL | |

**状态机**（`src/constants/` 单点定义）：

```
available ──管理员停用──▶ disabled（终态，不可恢复为 available）
available ──used_count 达 max_uses──▶ finish（终态）
available + expires_at 已过 ──消费时刻判定──▶ 视为拒绝（expired 非持久化状态，由 expires_at 推导）
```

> `expired` 不落库（修正旧系统"懒翻转"缺陷）：状态判定一律 `status=available AND (expires_at IS NULL OR expires_at > NOW()) AND used_count < max_uses`，实时计算（FR-001/FR-002）。

**并发约束**：消费事务内 `SELECT ... FOR UPDATE` 码行 → 判定 → `used_count+1` + 插 use 行（research R9）。

### 1.3 invitation_code_use（邀请码使用者关联）

| 字段 | 类型 | 约束 |
|------|------|------|
| id | BIGINT PK | auto |
| code_id | BIGINT FK → invitation_code.id | **UNIQUE(code_id, user_id)** |
| user_id | BIGINT FK → user.id | |
| used_at | DATETIME | NOT NULL |

修复旧系统 `users varchar(20)` 逗号串溢出缺陷（FR-030）：一人一条，可按码查全部使用者。

### 1.4 point_account（积分余额，缓存）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| user_id | BIGINT PK/FK → user.id | | 一人一行 |
| balance | INT | NOT NULL DEFAULT 0 | **可由流水重算推导的缓存**（宪法 III） |
| updated_at | DATETIME | NOT NULL | |

### 1.5 point_transaction（积分流水，真相源）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| user_id | BIGINT FK | NOT NULL | |
| type | ENUM | NOT NULL | M1 仅 `register_reward`；M2 扩展消费/充值/手调 |
| amount | INT | NOT NULL | 正负保留（M1 仅 +2） |
| balance_after | INT | NOT NULL | 入账后余额快照（快速核对位，非真相源） |
| remark | VARCHAR(255) | NULL | 如"注册奖励" |
| ref_type / ref_id | VARCHAR(32) / BIGINT | NULL | 来源引用（M1: ref_type=`register`） |
| created_at | DATETIME(3) | NOT NULL | 排序键 |

**一致性规则**：流水与余额**同事务**写入；重算校验 `SUM(amount) = balance` 为集成测试断言（宪法 III，quickstart S1）。

### 1.6 user_token（激活/重置/换邮箱凭证）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| user_id | BIGINT FK | NOT NULL | |
| type | ENUM | NOT NULL | `activate` / `password_reset` / `email_change` |
| token_hash | CHAR(64) | **UNIQUE** | SHA-256(token)；明文仅存邮件链接（research R11） |
| payload | VARCHAR(255) | NULL | `email_change` 存新邮箱 |
| expires_at | DATETIME | NOT NULL | 激活 24h / 重置 30min |
| used_at | DATETIME | NULL | 一次性判定 |
| created_at | DATETIME | NOT NULL | |

规则：同 user+type 再请求即作废旧 token（删除或标记过期）；消费校验 `used_at IS NULL AND expires_at > NOW()`。

### 1.7 mail_outbox（事务邮件发件箱）

| 字段 | 类型 | 约束 |
|------|------|------|
| id | BIGINT PK | auto |
| to_email | VARCHAR(255) | NOT NULL |
| template | VARCHAR(64) | NOT NULL（`activate` / `password_reset` / `email_change`） |
| payload_json | JSON | NOT NULL（模板变量，含 token） |
| status | ENUM | `pending` / `sent` / `failed` |
| attempts | INT | NOT NULL DEFAULT 0 |
| last_error | VARCHAR(500) | NULL |
| related_user_id | BIGINT | NULL |
| created_at / sent_at | DATETIME | |

规则：业务事务内落 `pending` → 异步消费发 SMTP；失败置 `failed` 可见可重发（FR-024）；重发频率限制经 Redis 计数（research R7）。

### 1.8 soap_call（SOAP 调用记录与幂等）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| idempotency_key | VARCHAR(64) | **UNIQUE** | 调用方生成；重复投递拒绝执行（research R6） |
| command | VARCHAR(64) | NOT NULL | 命令名进 `src/constants/`（M1 仅 `server info`） |
| args_json | JSON | NOT NULL | |
| status | ENUM | `pending` / `success` / `failed` | |
| attempts | INT | NOT NULL DEFAULT 0 | ≤3 |
| result_digest | VARCHAR(500) | NULL | 结果摘要（截断） |
| last_error | VARCHAR(500) | NULL | |
| duration_ms | INT | NULL | |
| requested_by | VARCHAR(64) | NOT NULL | 触发来源（服务/操作名） |
| created_at / finished_at | DATETIME | | |

### 1.9 audit_log（审计事件）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| category | ENUM | NOT NULL | `soap` / `mail` / `security` |
| action | VARCHAR(64) | NOT NULL | 如 `login_failed` / `phpass_upgraded` / `password_changed` |
| actor_user_id | BIGINT | NULL | |
| payload_json | JSON | NOT NULL | **脱敏**：事件不记敏感值（无密码/令牌/明文） |
| ip | VARCHAR(45) | NULL | |
| created_at | DATETIME(3) | NOT NULL | |

M1 必审事件：登录失败（FR-013 模糊提示旁路）、存量哈希升级成功（phpass→bcrypt_wp，一人一次追踪）、密码变更双写结果、激活/重置 token 消费、越权尝试（FR-017）。

### 1.10 route_map（旧→新路由映射）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | BIGINT PK | auto | |
| old_key | VARCHAR(64) | **UNIQUE** | 规范化键：`p:123` / `page_id:79` / `cat:4` |
| new_path | VARCHAR(255) | NOT NULL | |
| enabled | BOOLEAN | NOT NULL DEFAULT true | 停用即 404 |
| created_at | DATETIME | NOT NULL | |

M1 仅机制 + 登录类硬编码跳转（不走此表）；`?p=`/`?page_id=`/`?cat=` 数据 M3 迁移填充。进程内全量缓存 + 写时失效（research R8）。

## 2. 游戏库（只读 introspect；零 DDL）

### 2.1 acore_auth.account（**契约写**：注册 INSERT / 改密 UPDATE）

M1 触碰字段（其余字段由 AzerothCore 默认值接管）：

| 字段 | M1 行为 | 说明 |
|------|---------|------|
| id | 读 | 游戏账号 ID |
| username | 写（UPPER 存） | 与站点 username 大写一致（AzerothCore 约定） |
| sha_pass_hash | 写 | `SHA1(UPPER(username):UPPER(password))`，research R3 |
| email / reg_mail | 写 | 与站点 email 一致 |
| joindate / last_login | 读 | |
| locked | 读 | |

**写入收口**：`lib/db` auth client 仅暴露 `createAccount({username,email,shaPassHash})` / `updateAccountCredential(id,{shaPassHash})` / `findByUsername` 三个方法；连接 MySQL 用户权限仅 SELECT + account 表 INSERT/UPDATE（根本防线，research R5）。

### 2.2 acore_characters.characters（只读投影）

M1 读取字段：`guid / account / name / race / class / level / gender / online`。「我的角色」页按 `account = 当前用户游戏账号 ID` 服务端过滤（FR-017 归属校验）。种族/职业/头像映射表进 `src/constants/`（60 年代客户端枚举）。

### 2.3 acore_world / eluna

M1 仅建 client 与连接自检（FR-022 四库均可达），无表交互。

## 3. 实体关系总览

```text
invitation_code 1──N invitation_code_use N──1 user 1──1 point_account
                       │                      └──1 point_transaction (N)
                       └──(register_code_id 反向关联 user)
user 1──N user_token / mail_outbox / audit_log / soap_call(requested_by 弱关联)
route_map（独立，无外键）
acore_auth.account ◀──契约写── user（经 username 关联，跨库无外键）
acore_characters.characters ──只读投影──▶ user 名下角色列表（经 account id）
```

## 4. 迁移与种子

- 业务库初始 migration：上述 10 表 + 索引；forward-only。
- dev 种子（合成数据）：1 个 phpass 存量测试账号（公开测试向量生成的哈希）、1 个管理员、2 个不同状态邀请码。
- 生产存量 6,330 用户数据迁移属 M3 内容迁移批次前的独立迁移任务（research/01 §2），不在本 feature 内——但本 feature 的 schema 必须容纳其落位（`wp_user_id`/`password_algo` 已预置）。
