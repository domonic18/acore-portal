# Tasks: M1 地基 — 账号全链路 + 游戏集成 + 路由兼容

**Input**: Design documents from `/specs/001-m1-account-foundation/`

**Prerequisites**: plan.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅ constitution v1.0.1 ✅

**Tests**: 宪法原则 VIII「行为变更必有测试」为硬性要求——每个用户故事包含测试任务（先写、先失败）。

**Organization**: 按用户故事分组（US1-US7 对应 spec.md）；路径遵循 plan.md 项目结构（依赖方向 `app → server → lib → constants`）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1-US7）

---

## Phase 1: Setup（共享基础设施）

**Purpose**: 项目初始化与工具链

- [x] T001 Next.js 单体脚手架：pnpm + Next.js(App Router) + React 18 + TypeScript strict + Tailwind；按 plan.md 建 `src/{app,server,components,lib,constants,styles}`、`prisma/`、`scripts/`、`tests/{unit,integration,e2e}`；单文件 ≤350 行
- [x] T002 [P] 工具链与质量门禁：ESLint + Prettier + Vitest + Playwright；根 `Makefile` 固化 `make check`（lint+typecheck+test 全绿，宪法 VIII）
- [x] T003 [P] 环境变量加载器 `src/lib/env.ts`：Zod 校验 `.env` 全量键（业务库/游戏四库 URL、REDIS_URL、SOAP_*、SMTP_*、SESSION_SECRET），启动 fail-fast；凭据不入日志
- [x] T004 [P] 依赖方向守护：引入 `server-only` 包强制客户端组件禁 import `server/`；ESLint import 边界规则（app→server→lib→constants）
- [x] T005 dev 环境四件套（research R10）：扩展 `docker/docker-compose.dev.yml` 加 Mailpit(8025) 与 SOAP mock；`scripts/dev/init-game-schemas.sql` 从备份库提取 acore_auth/acore_characters **仅结构**+合成种子（无生产数据入库）；`scripts/dev/soap-mock.ts` 三态开关（正常/超时/失败）

---

## Phase 2: Foundational（阻塞性前置，完成后故事才可开工）

**⚠️ CRITICAL**: 本阶段完成前不得开始任何用户故事

- [x] T006 Prisma 多数据源骨架与业务库初始 migration：`prisma/schema-{business,auth,characters,world,eluna}/` 五目录；业务库 10 表一次建齐（data-model §1）——约束照录：`user.username`/`email` UNIQUE 且 username 禁 `@`、`password_algo ENUM('phpass','bcrypt_wp')`、`wp_user_id` UNIQUE NULL；`invitation_code_use(code_id,user_id)` UNIQUE；`soap_call.idempotency_key` UNIQUE；`route_map.old_key` UNIQUE；`user_token.token_hash` UNIQUE；`point_transaction` 含 `balance_after`；migration forward-only
- [x] T007 [P] 游戏四库 introspect 与收口：四库 `db pull` 生成只读类型；`src/lib/db/` 导出 5 client；**auth client 仅暴露 `createAccount`/`updateAccountCredential`/`findByUsername` 三个契约方法**；附 MySQL 权限脚本（游戏库连接用户仅 SELECT；auth 库仅 account 表 INSERT/UPDATE + 其余 SELECT——防写根本防线，research R5）
- [x] T008 [P] 常量单点 `src/constants/`：PASSWORD_ALGO、INVITATION_STATUS(available/disabled/finish，expired 实时推导不落库)、POINT_TX_TYPE(M1 仅 register_reward)、AUDIT_CATEGORY(soap/mail/security)、TOKEN_TYPE(activate 24h / password_reset 30min / email_change)、SOAP_COMMANDS 白名单（M1 仅 `server info`）
- [x] T009 [P] Redis client `src/lib/redis/`：会话存储 + 通用计数限速封装（供邮件重发/预留登录限速）
- [x] T010 [P] API 响应与错误约定：统一 `{ error: { code, message } }` helper + Zod 边界校验封装（`src/server/http.ts`）；对外文案不暴露内部细节
- [x] T011 [P] 审计服务 `src/server/services/audit.ts`：category/action/actor_user_id/payload_json/ip；**脱敏铁律——不记密码/令牌/明文敏感值**（宪法 VI）
- [x] T012 [P] 邮件 outbox 服务：`src/server/services/mail-outbox.ts` + `src/lib/mail/`（nodemailer；模板 activate/password_reset/email_change；pending→sent/failed；失败可见可重发；重发限速 ≥60s 间隔 ≤5 次/天，Redis 计数）
- [x] T013 [P] 密码域 `src/lib/auth/`：`wp-bcrypt.ts`——目标格式签发（`$wp` + bcrypt(base64(HMAC-SHA384(key='wp-sha384', msg=password)), cost 12)，research R1 方案 Y）与校验（对照 `hash.slice(3)`，**无 trim**，与生产 verify 行为一致）；`phpass.ts`——过渡垫片自实现（迭代 MD5，itoa64，`B`=13→8,192 次，**无 trim**），零运行时依赖
- [x] T014 会话框架：`src/lib/auth/session.ts`（JWT HttpOnly 2h + Redis `session:{userId}:{jti}` 支持吊销；remember=30d refresh token 每次使用轮换、单次有效、重放全吊销，research R4）+ `src/middleware.ts`（会话解析/轮换、路由守卫入口）
- [x] T015 [P] 密码域黄金向量测试：`tests/unit/phpass.test.ts`（WP 公开测试向量锁定）+ `tests/unit/wp-bcrypt.test.ts`（自哈希自校验 + 算法注释引用 research R2；生产凭据/哈希不入 git）

**Checkpoint**: 五库 client 可连、密码域向量测试绿——用户故事可并行开工

---

## Phase 3: US1 — 存量用户无感登录 (Priority: P1) 🎯 MVP

**Goal**: 存量用户原用户名+原密码直接登录，phpass 路径透明升级，$wp$ 路径零接触

**Independent Test**: 种子存量账号（双格式）登录→全部成功进用户中心；phpass 账号哈希已重写且审计留痕；$wp$ 账号哈希原样

### Tests for US1

- [x] T016 [P] [US1] 集成测试 `tests/integration/login.test.ts`：phpass 登录→`bcrypt_wp` 重写+`hash_upgraded` 审计；`$wp$` 登录→哈希**原样未动**；错误密码统一 401 模糊文案；remember 会话次日有效

### Implementation for US1

- [x] T017 [US1] 登录服务 `src/server/services/auth/login.ts`：按 `password_algo` 分派（phpass→phpass.ts / bcrypt_wp→wp-bcrypt.ts）；`$P$` 通过→重哈希 cost 12 写回+审计 `hash_upgraded`（一人一次，纯站点侧不碰游戏端）；**竞态防护**：校验失败且 algo=phpass 时重读哈希再试一次（并发透明升级，风险清单 #4）
- [x] T018 [US1] remember 轮换接入 login 流程（T014 机制的故事级装配）
- [x] T019 [US1] `POST /api/auth/login` Route Handler：401 INVALID_CREDENTIALS 统一模糊（哈希损坏→文案附"找回密码"引导，不锁号 FR-013/边缘场景4）；审计 `login_failed` 含真实原因（仅审计可见）；429 语义预留（M4 实装）
- [x] T020 [US1] 登录页 `src/app/(auth)/login/page.tsx`：用户名/密码/记住登录；失败展示统一文案
- [x] T021 [US1] 种子脚本 `scripts/dev/seed.ts`：phpass（公开向量）与 `$wp$`（自哈希）存量测试账号、管理员 1（role=admin）、邀请码 2（available/disabled 各 1）
- [x] T022 [US1] E2E `tests/e2e/login.spec.ts`：双格式登录→用户中心；二次登录（新哈希路径）；`$wp$` 哈希未动断言
- [x] T023 [US1] SC-001 验收脚本 `scripts/verify/sc001-login.ts`：读 `workspace/verify-credentials.txt`（gitignore，不入库不入 git，research R12）逐账号登录断言 100% 成功+哈希已升级；**前置外部依赖：凭据收集需提前启动**

**Checkpoint**: quickstart S2 本地预演全绿 → MVP 里程碑锚点路径已通

---

## Phase 4: US2 — 新玩家注册（范围调整 2026-10-23） (Priority: P1)

> **范围调整（2026-10-23 用户决策，同步飞书需求池）**：「注册-邀请码必填」恢复入池但降为 **P2 后续迭代**——注册流程**不要求邀请码**；本阶段仅保留注册核心链路（用户名=游戏账号/邮箱激活设密/双端建号/奖励积分）。T025 邀请码服务及其在 T024/T026/T028/T032 中的占用与撞码用例顺延至邀请码迭代实施。

**Goal**: 注册→邮件激活→设密→站点+游戏端同时建号，注册奖励 +2 入账（无邀请码门槛）

**Independent Test**: 注册走完全流程；验证奖励流水、游戏端账号存在、跨库失败回滚

### Tests for US2

- [x] T024 [P] [US2] 集成测试 `tests/integration/register.test.ts`：模拟游戏库失败→整体回滚 0 半成品账号（SC-004）；并发相同用户名仅一成功（FR-009）；`SUM(amount)=balance` 重算断言（宪法 III）（撞码并发用例随邀请码迭代顺延）。附:激活/重发/占位过期回收 9 用例

### Implementation for US2

- [ ] T025 [US2][延后→P2 邀请码迭代] 邀请码服务 `src/server/services/invitation.ts`：实时状态判定 `status=available AND (expires_at IS NULL OR expires_at>NOW()) AND used_count<max_uses`（FR-001/002，expired 不落库）；消费=事务内 `SELECT...FOR UPDATE`→判定→`used_count+1`+use 行
- [x] T026 [US2] 注册编排事务 `src/server/services/auth/register.ts`：单事务完成 user(占位)+游戏端 account 创建+积分入账+activate token+outbox 邮件；**任一失败整体回滚**；两侧查重+唯一索引冲突→409 可读文案；`503 GAME_DB_UNAVAILABLE`（邀请码消费步骤随 T025 一并延后）
- [x] T027 [US2] 账本服务 `src/server/services/ledger.ts`：入账（流水+余额同事务，`balance_after` 快照）+ `recalculate(userId)` 重算函数（供测试/对账/日终任务复用）
- [x] T028 [US2] `POST /api/auth/register`：校验顺序 用户名格式（2-32 位、禁 `@`，FR-003）→两侧占用（FR-004）；202 受理；错误码按 contracts/api-auth.md（邀请码校验随 T025 延后）
- [x] T029 [US2] `POST /api/auth/set-password`：token 一次性 24h+密码复杂度（≥8 且含字母与数字且 ≠username，FR-006）；签发 `$wp$` bcrypt + 游戏端 `SHA1(UPPER(username):UPPER(password))`（research R3）；激活即登录；审计 `account_activated`
- [x] T030 [US2] 激活邮件重发端点（Redis 限速 ≥60s ≤5 次/天，FR-010）
- [x] T031 [US2] 注册页+设密页 `src/app/(auth)/register/`、`register/set-password/`：**注册页无密码输入**（FR-005）；token 过期引导重发
- [x] T032 [US2] E2E `tests/e2e/register.spec.ts`：quickstart S1 全流程(注册→Mailpit 收件→弱密码拒绝→设密→激活即登录→双端同密→积分 +2 库内断言,SUM=balance)。偏差:邀请码步骤随范围调整跳过;积分页断言改库内(积分页属 US4)

**Checkpoint**: quickstart S1 全绿

---

## Phase 5: US3 — 密码找回与修改·双写一致 (Priority: P1)

**Goal**: 找回/改密双写站点+游戏端，单边失败可见可重试，禁静默

**Independent Test**: 改密后双端新密码可登录；模拟游戏端写入失败→不标记完成+审计告警；重置链接一次性 30min

### Tests for US3

- [x] T033 [P] [US3] 集成测试 `tests/integration/password.test.ts`：双写一致（SC-003）；游戏端失败→不标记完成+可见重试状态+审计告警（FR-014）；token 一次性/过期/再签作废；改密后旧会话全部吊销

### Implementation for US3

- [x] T034 [US3] 密码变更服务 `src/server/services/auth/password.ts`：双写（`$wp$` bcrypt + 游戏端 sha_pass_hash）；双写失败语义=变更不标记完成+留待重试+审计告警；成功后吊销全部既有会话
- [x] T035 [US3] user_token 服务 `src/server/services/user-token.ts`：签发（明文仅进邮件链接，库存 SHA-256）；消费（`used_at IS NULL AND expires_at>NOW()`）；同 user+type 再签发作废旧 token（research R11）
- [x] T036 [US3] 端点：`POST /api/auth/forgot-password`（**恒定 202 不泄露邮箱存在性**+限速）、`/api/auth/reset-password`、`/api/account/change-password`、`/api/account/change-email` + `/api/account/confirm-email`（FR-015/021）
- [x] T037 [US3] UI：`forgot-password`/`reset-password` 页 + settings 页改密/换邮箱入口
- [x] T038 [US3] E2E `tests/e2e/password.spec.ts`：quickstart S3 主链路(改密→吊销→重登;Mailpit 收信→重置→复用失效)。偏差:游戏端失败注入放集成层(vi.spyOn,E2E 无法 mock 服务层)

**Checkpoint**: quickstart S3 全绿

---

## Phase 6: US4 — 用户中心 8 页 (Priority: P2)

**Goal**: 登录用户 8 页全部可达；角色/积分真实数据；越权 0 成功

**Independent Test**: 测试账号逐一访问 8 页；角色仅本人；传他人 guid 得 403+审计

### Implementation for US4

- [x] T039 [P] [US4] 角色投影服务 `src/server/services/characters.ts`：`characters.account = 本人游戏账号 id` 服务端强制过滤（FR-017）；race/class 60 年代枚举与头像映射进 `src/constants/`；`GET /api/account/characters`（503 不白屏）〔偏差:恢复列表源=生产模块表 recovery_item,补 introspect 模型+dev fixture(业务连接跨库,游戏端只读 R5)〕
- [x] T040 [P] [US4] 数据端点：`GET /api/account/points`（余额+流水分页）、`GET /api/account/restore-items?guid=`（**归属校验→403 CHARACTER_NOT_OWNED+审计 ownership_violation**）、`GET /api/account/raf`（结构就绪空态）〔偏差:M1 不连 world.item_template,items.name/quality 返回 null,前端回退「物品 #entry」〕
- [x] T041 [US4] 布局与 8 页 `src/app/account/{overview,characters,points,orders,item-restore,raf,settings,address}/page.tsx`：orders/address 空态框架页（FR-018）；未登录→`/login` 引导（FR-016）；积分页余额真实数据〔偏差:深校验收口到 (account) 布局层 requireSession 一次覆盖 8 页;settings 拆服务端壳+client 表单;积分页首页 RSC+客户端翻页走 API〕
- [x] T042 [US4] `PATCH /api/account/profile`（nickname 2-64）（settings 页新增昵称表单）
- [x] T043 [US4] E2E `tests/e2e/account.spec.ts`：quickstart S4（8 页可达/仅本人角色/越权 403+审计/未登录引导，SC-007）〔偏差:增补昵称保存+服务端 422;playwright outputDir 移出仓库——next dev 监听仓库根,产物写入触发 HMR 打断在跑用例〕

**Checkpoint**: quickstart S4 全绿

---

## Phase 7: US5 — 邀请码后台管理 (Priority: P2)

**Goal**: 管理员批量生成/查看（实时状态）/启停邀请码

**Independent Test**: 生成 10 个上限 5 次 7 天过期→消费 1 次→列表可见→停用 1 个→注册即时被拒

### Tests for US5

- [ ] T044 [P] [US5] 集成测试 `tests/integration/invitation-admin.test.ts`：参数落库、实时推导（过期码显示 expired 非可用，FR-002 后台侧）、停用后注册即时拒绝、finish/终态不可停用变更

### Implementation for US5

- [ ] T045 [US5] 服务+端点 `src/server/services/invitation-admin.ts` + `POST/GET/PATCH /api/admin/invitation-codes`：admin 守卫（非 admin→403+审计）；批量 1-200 个（前缀 0-16/长度 8-32/上限 1-999/过期天数可空）；码值=前缀+随机串（去混淆字符集 0-9a-zA-Z 去 0O1lI）；状态机 `available→disabled` 单向
- [ ] T046 [US5] 后台页 `src/app/admin/invitation-codes/page.tsx`：生成表单/列表（状态/已用次数/使用者关联，筛选搜索分页）/启停
- [ ] T047 [US5] E2E `tests/e2e/admin-invitation.spec.ts`：quickstart S5

**Checkpoint**: quickstart S5 全绿

---

## Phase 8: US6 — 游戏集成基座·四库+SOAP (Priority: P2)

**Goal**: 命令通道四能力（超时/重试/幂等/审计）以低风险只读命令验证；四库连接自检

**Independent Test**: `.server info` 成功留痕；超时重试 3 次全留痕；同幂等键不重复执行

### Tests for US6

- [ ] T048 [P] [US6] 集成测试 `tests/integration/soap.test.ts`：成功/超时重试全留痕（US6 场景2）、幂等键重复投递返回首次结果（边缘场景8）、白名单外命令拒绝

### Implementation for US6

- [ ] T049 [US6] SOAP 命令层 `src/server/soap/`：`execute(command, args, {idempotencyKey, idempotent, requestedBy, timeoutMs=5000})`——**落库先行**（soap_call pending，唯一键防重复投递）；幂等命令自动重试 ≤3 次指数退避 1s/2s/4s，非幂等失败不重试转调用方；每次尝试写 audit_log(category=soap)；命令白名单外拒绝（contracts/soap-channel.md）
- [ ] T050 [US6] 健康自检：五 client + SOAP 连接检查；启动时四库可达断言（FR-022 场景3）；SOAP 未开→degraded 标记不阻塞启动
- [ ] T051 [US6] 通道验证入口：CLI 脚本 `scripts/verify/soap-check.ts` 执行 `.server info` 展示结果/耗时/审计 id
- [ ] T052 [US6] quickstart S6 场景脚本化验证（mock 三态切换走查）

**Checkpoint**: quickstart S6 全绿

---

## Phase 9: US7 — 旧路由兼容层 (Priority: P3)

**Goal**: 旧登录地址 302、映射表 301 机制就绪、未命中 404、商店四件套不变

**Independent Test**: 三类旧地址跳转正确；注册测试映射→301 生效→删除→404

### Implementation for US7

- [ ] T053 [P] [US7] route_map 服务 `src/server/services/route-map.ts`：规范化键（`p:123`/`page_id:79`/`cat:4`）查询；进程内全量缓存+写时失效（research R8）
- [ ] T054 [US7] middleware 兼容层：`/wp-login.php`→302 `/login`（`action=register`→`/register`、`action=lostpassword`→`/forgot-password`，硬编码不查表）；`?p=`/`?page_id=`/`?cat=`→route_map 命中 301/未命中 404（不做模糊猜测，FR-026）；`/shop` `/cart` `/checkout` `/my-account` 不变（FR-027）
- [ ] T055 [US7] 集成测试 `tests/integration/route-compat.test.ts`：quickstart S7（含映射增删后缓存失效断言，SC-005 机制部分）

**Checkpoint**: quickstart S7 全绿

---

## Phase 10: Polish & 横切

- [ ] T056 quickstart.md S1-S7 全量走查并记录结果
- [ ] T057 [P] 安全复查：全链路日志/审计/响应 grep 无密码/令牌/明文敏感值（宪法 VI）；生产哈希与凭据确认不入 git
- [ ] T058 [P] 文档与状态同步：AGENTS.md Setup commands 回填实际 scripts；development-plan M1 状态流转；飞书需求池条目更新（与用户协作）
- [ ] T059 `make check` 全绿 + CodeReview 三维度（规范性/封装性/架构合理性）问题清零
- [ ] T060 SC-001 正式验收：`scripts/verify/sc001-login.ts` 全量执行（**前置：100 组凭据收集完成，research R12；≥20 组可先跑首轮**）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无依赖，立即开工
- **Phase 2 Foundational**：依赖 Setup；**阻塞全部用户故事**
- **Phase 3-9 用户故事**：依赖 Foundational；故事间按优先序推进，可并行（见下）
- **Phase 10 Polish**：依赖全部故事完成

### User Story Dependencies

- **US1（P1）**：仅依赖 Foundational（种子自足）——**MVP**
- **US2（P1）**：仅依赖 Foundational（邀请码用种子）；其 ledger 服务被 US4 积分页读取（接口依赖，服务先行）
- **US3（P1）**：依赖 T013 密码域与 T014 会话（均在 Foundational）；与 US1 共享 auth lib，可并行
- **US4（P2）**：依赖 US2 的 ledger（积分页读）与 T014 会话；建议 US2 后开工
- **US5（P2）**：独立（依赖 Foundational schema）
- **US6（P2）**：独立（依赖 Foundational + T005 SOAP mock）
- **US7（P3）**：独立（依赖 T014 middleware 挂载点）

### Parallel Opportunities

- Foundational 内 T007-T013 全部可并行
- US6、US7 与 US1-US5 无文件交集，可全程并行
- 单故事内测试任务与实现的服务层任务可并行起步（测试先失败）

---

## Implementation Strategy

### MVP First（仅 US1）

1. Phase 1 + Phase 2 完成
2. Phase 3（US1）→ **STOP**：quickstart S2 验证——存量双格式登录链路全通
3. 此刻 SC-001 锚点路径已打通，可演示

### Incremental Delivery

Setup+Foundational → US1（MVP）→ US2 → US3 → US4 → US5 → US6 → US7 → Polish；每故事停在 Checkpoint 独立验证后再进下一个。

### 风险前置提醒（research 风险清单映射）

- **凭据收集（R12/T060）**：外部依赖，与开发并行提前启动
- **切换日快照漂移**：本里程碑只做开发/内测；生产数据迁移（`wp_user_id`/`password_algo` 落位）在上线批次用最新数据执行
- **并发透明升级竞态**：T017 已含防护方案

## Notes

- [P] = 不同文件、无未完成依赖
- 每任务或逻辑组完成后 commit（分批纪律，AGENTS.md Git 纪律）
- 停在任一 Checkpoint 可独立验证
- 禁止：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
