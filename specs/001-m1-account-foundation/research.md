# Phase 0 Research: M1 地基 — 账号全链路 + 游戏集成 + 路由兼容

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-23

> 本文档决议均为「规划基线」级——`docs/arch/00` 定稿时逐条复核并升级。每条格式：Decision / Rationale / Alternatives considered。

## R1 目标密码哈希格式【2026-10-23 用户裁决方案 Y】

- **Decision**: 新哈希**完整沿用 WP 6.8 目标格式**：`$wp` + `bcrypt(base64(HMAC-SHA384(key='wp-sha384', msg=password)), cost 12)`。注册设密/改密/重置/登录期升级一律签发此格式，`password_algo` 统一 `bcrypt_wp`。原 argon2id 选型**废弃**。
- **Rationale**: ① 存量 42%（2,658 户）`$wp$` 哈希**原样可用零接触**，其登录路径与生产此刻运行的代码完全同构——迁移风险集中收敛到 3,672 个 `$P$` 用户；② 校验路径 3 → 2（phpass 垫片衰减后归 1），去掉 argon2 native 依赖，符合宪法 VII YAGNI；③ WP 的 HMAC-SHA384 预哈希已解决 bcrypt 72 字节截断并抬高离线爆破成本，6K 用户规模下安全性足够；④ 未来若需 argon2id，登录期重哈希机制现成，随时可再升。
- **升级判定只看格式前缀（`$P$` → 升级），不看 cost**：存量 cost 10 一律不重写（保住零接触承诺）；新签发哈希 cost 12 抬升安全余量（单常量，无复杂度代价）。
- **Alternatives considered**:
  - argon2id 目标（原 R1）：强度上限更高，但多一条过渡路径、全员首登重写、native 依赖；2026-10-23 用户裁决否决（简化优先）。
  - 强制全员重置密码：违反 D1（登录零变化）与 SC-001 验收锚点；否决。
  - 自定义前缀/自研格式：无收益，徒增第二套格式心智；否决。

## R2 存量哈希校验器（phpass + WP6.8 bcrypt 双格式）【2026-10-23 两轮实测定稿】

> **勘误一**：早期假设"6,330 存量用户均为 phpass `$P$`"不成立。备份库 `wp_users.user_pass` **精确分布（元组级扫描，2026-10-23）**：`$P$B` phpass **3,672 条（58%）** + `$wp$` bcrypt **2,658 条（42%）** = 6,330，无第三种格式（纯 MD5 为 0）。前者为 WP 6.8 升级（2025-04）后未再登录的账号，后者为升级后登录过、被核心透明升级的账号——随时间推移 `$wp$` 占比还会增长，双格式都必须支持。
> **勘误二**：`$wp$` 前缀**不是插件**，是 **WordPress 6.8 核心默认行为**（备份 `wp-includes/pluggable.php:2753-2888` 为准；插件目录无任何 bcrypt 插件）。且 bcrypt 之前存在**预哈希**：直接 bcrypt 校验必失败（已实测踩坑并修正）。

- **Decision**: 登录校验按前缀分派（精确复刻生产 `wp_check_password`）：
  - `$wp$2y$`：`prehash = base64(HMAC-SHA384(key='wp-sha384', msg=password))` → `bcrypt.compare(prehash, hash.slice(3))`（**无 trim**，与生产 verify 行为一致）
  - `$P$`：phpass portable 迭代 MD5（itoa64 字母表，`B`=13 → 8192 次迭代，**无 trim**），自实现 `src/lib/auth/phpass.ts`（Node 内置 crypto，零依赖）
  - `$P$` 校验通过后重哈希为 `$wp$` bcrypt（cost 12，research R1 方案 Y）——升级一人一次，审计 `hash_upgraded`；**`$wp$` 用户零接触（哈希原样保留，不重写）**；透明升级是纯站点侧操作：明文未变，游戏端 SHA1 哈希不受影响（游戏端双写仅发生在改密/重置等明文变更场景，FR-014）
  - `bcryptjs`（纯 JS）为**长期依赖**（目标格式即 bcrypt）；phpass 自实现为唯一过渡垫片，随存量衰减后可移除
- **Rationale**: 逐字对照备份 WP 核心源码实现，保证存量兼容零死角；算法已用**真实生产凭据端到端实测 MATCH**（2026-10-23，账号 422169327，凭据存 workspace/verify-credentials.txt 不入 git）——迁移路径中风险最高的环节已消除。
- **校验正确性锁定**：phpass 用公开测试向量 + bcrypt 用本条实测凭据做 golden case（凭据值与生产哈希均不入 git，测试文件只存算法不存样本；SC-001 样本集走 gitignore 的 workspace 文件）。
- **Alternatives considered**: 仅实现 phpass（遗漏 42% 存量，事故级）；直接 bcrypt 无预哈希（实测 NO_MATCH，即本次勘误来源）；npm `phpass` 包（维护停滞、供应链风险）；否决。

## R3 游戏端"同密"哈希细节

- **Decision**: 站点与游戏端**同明文、各端各自哈希**。游戏端写入值 = `SHA1(UPPER(username) + ':' + UPPER(password))`（AzerothCore/TrinityCore 标准算法，`acore_auth.account.sha_pass_hash`，username 字段本身也以 UPPER 存储）。站点端为 `$wp$` bcrypt（research R1 方案 Y）。
- **Rationale**: "同密契约 D2"的真实含义是同一明文密码双端可登录，而非同哈希串；两端哈希体系不可互换。该细节是 FR-007/FR-014 的实现前提，误解为"同哈希"会直接破坏游戏端登录。
- **Alternatives considered**: 无——由 AzerothCore schema 约定唯一确定。

## R4 会话方案

- **Decision**: JWT HttpOnly Cookie（access，短效 2h）+ Redis 会话记录（`session:{userId}:{jti}`，支持即时吊销与设备清单）；「记住登录」= 30 天 refresh token，存 Redis 且**每次使用轮换**（单次有效，防盗用）。Cookie 属性：HttpOnly + Secure（生产）+ SameSite=Lax + Path=/。
- **Rationale**: JWT 无状态签发 + Redis 状态记录，兼顾性能与"改密后旧会话全部失效"能力（FR-014 改密必须吊销既有会话，纯 JWT 做不到）。轮换 refresh token 可检测重放。
- **Alternatives considered**: 纯 opaque session id + Redis（更简单，但规划基线已定 JWT 路线，且 8 页 RSC 数据面需要无状态鉴权声明）；纯 JWT 无 Redis（无法吊销，违反改密一致性要求）；否决。

## R5 Prisma 多数据源与游戏库防写

- **Decision**: Prisma 多 schema 目录方案（`prisma/schema-{business,auth,characters,world,eluna}/`，每库独立 client 实例，`lib/db/` 统一收口）。业务库走 `prisma migrate`；游戏四库仅 `prisma db pull` introspect 生成类型，**永不 migrate**。防写三层：①根本防线 = **MySQL 账号权限**（游戏库连接用户仅 SELECT；auth 库连接用户仅 account 表 INSERT/UPDATE + 其余 SELECT）；②应用层 = `lib/db` 的 auth client 仅暴露 `createAccount`/`updateAccountCredential`/查重三个契约方法；③ CI 规则禁止游戏 schema 出现在 migrate 目标。
- **Rationale**: 宪法 V 要求零 DDL 与生产只读；DB 权限是唯一可靠的"防写"，应用层约定仅防误用。Prisma 官方不支持单 schema 多 URL，多目录 multi-client 是标准做法。
- **Alternatives considered**: 裸 mysql2 SQL 直连游戏库（失去类型收口，AGENTS.md 要求外部数据定义类型）；单 schema 双 datasource（Prisma 不支持多写库）；否决。

## R6 SOAP 命令层

- **Decision**: `src/server/soap/` 封装 node-soap client：统一 `execute(command, args, {idempotencyKey})` 入口；超时 5s；重试 ≤3 次指数退避（仅幂等命令自动重试，非幂等命令失败转人工/队列）；每次调用落 `soap_call` 表（命令/参数/结果摘要/耗时/尝试次数/幂等键），入 `soap_call` 与 `audit_log` 双记录。M1 验证用只读命令：`.server info`。
- **Rationale**: spec FR-023/US6 要求超时/重试/幂等/审计四能力在 M1 以低风险方式验证；worldserver SOAP 返回自由文本（`.server info`），类型收口在 lib 层定义返回结构。幂等键唯一索引防止重复投递（宪法 II 边缘场景）。
- **Alternatives considered**: 直接裸调 node-soap 无封装（1,895 单滞留教训的直接反模式）；gRPC/HTTP 桥（引入新中间件，违宪法 VII）；否决。

## R7 事务邮件 outbox

- **Decision**: `mail_outbox` 表先行落库（to/template/payload/status/attempts），SMTP 发送为异步消费；发送失败可见（状态 failed + attempts + last_error）并支持重发；激活/重置/邮箱变更三类模板 M1 落地。发送入口带频率限制（Redis 计数，重发 ≥60s 间隔、≤5 次/天）。
- **Rationale**: FR-024 禁止静默丢失；outbox 模式让"已受理"与"已发出"解耦，SMTP 临时故障不阻塞注册主链路，且失败状态可被后台看见。
- **Alternatives considered**: 同步发送（SMTP 抖动直接拖垮注册体验且失败难追踪）；第三方邮件服务（spec Assumptions 明确沿用现有 SMTP）；否决。

## R8 旧路由 301 兼容层实现

- **Decision**: Next.js middleware 兜底 + DB `route_map` 表为数据源。规则：①`/wp-login.php*` → 302 `/login`（含 `action=register`→`/register`、`action=lostpassword`→`/forgot-password`，硬编码规则，不查表）；②`?p=`/`?page_id=`/`?cat=` → 规范化为 key 查 `route_map`，命中 301，未命中 404（不做模糊猜测，FR-026）。缓存：route_map 全量（预计 ≤200 行）进程内缓存 + 变更时失效，避免每请求查库。
- **Rationale**: 机制 M1 就绪（US7），映射数据 M3 填充；硬编码登录类规则与表驱动内容映射分离，登录跳转不依赖表数据。
- **Alternatives considered**: caddy 层配置 301（离开应用、运营不可自助维护映射表）；每请求查库（浪费）；否决。

## R9 并发控制（撞号/撞码）

- **Decision**: 注册链路用「唯一索引兜底 + 应用层友好翻译」：业务库 `user.username`/`user.email` 唯一索引、auth 库 account username 唯一（AzerothCore 自带）、`invitation_code_use(code_id, user_id)` 唯一；捕获冲突错误翻译为用户可读文案。邀请码占用在跨库事务内 `SELECT ... FOR UPDATE` 码行，判定状态机后再消费。改密等写操作以 user_id 行锁防并发改密互踩。
- **Rationale**: FR-009/边缘场景（并发撞号、撞码瞬间用完）要求仅一方成功且账目一致；跨库事务无法用单库锁解决，唯一索引是最终一致性的最后防线。
- **Alternatives considered**: 分布式锁（引入 Redis 锁复杂度，YAGNI——当前并发量 6K 用户完全够用唯一索引+行锁）；否决。

## R10 开发环境依赖（E2E 可行性）

- **Decision**: dev docker compose 扩展四件：①MySQL 内初始化 `acore_auth`/`acore_characters` 结构 fixture（`scripts/dev/init-game-schemas.sql`，从备份 dump 提取**仅结构**+合成种子数据，无生产数据入库）；②SOAP mock server（轻量 Node 脚本，解析 `.server info` 等命令返回固定文本，模拟超时/失败开关）；③Mailpit（SMTP 捕获 + Web UI，激活邮件全流程 E2E 依赖它）；④Redis。生产游戏库结构变更后 fixture 手动同步。
- **Rationale**: E2E（注册双写、phpass 登录、SOAP 通道）必须可在本地完整走通；备份库已有全量 dump 可安全提取结构。fixture 含少量**合成**种子（1 个 phpass 存量测试账号），不含任何真实用户数据（宪法 V）。
- **Alternatives considered**: 直连生产游戏库开发（违宪法 V 生产只读红线）；完整跑 AzerothCore worldserver（资源重、M1 无必要）；否决。

## R11 找回/激活 token 设计

- **Decision**: 统一 `user_token` 表（type: `activate`/`password_reset`/`email_change`），明文 token 只出现在邮件链接，库中仅存 SHA-256(token)；有效期 24h（激活）/30min（重置）；一次性（used_at 记录）；再次请求作废同 user+type 旧 token。
- **Rationale**: FR-015 一次性限时；哈希存储使库泄露不致 token 被盗用（宪法 VI）。
- **Alternatives considered**: JWT token（无法单点作废、需引入吊销表，等于回到 DB 记录）；明文存储（泄露即冒用）；否决。

## R12 SC-001 验收执行方式（风险项）

- **Decision**: M1 末验收抽样 100 个存量账号需要**明文凭据样本**——备份库只有哈希，明文不存在。执行方案：验收前由项目所有者从社区收集/整理 100 组真实凭据（旧站用户名+密码），存放于不入库不入 git 的私有文件（`workspace/verify-credentials.txt`，gitignore）；`scripts/verify/sc-001-login.ts` 读该文件逐个调用登录接口并断言 100% 成功 + 哈希已升级。**此为外部依赖，tasks 阶段必须列为前置任务**（收集凭据需要提前启动）。
- **Rationale**: SC-001 是 M1 验收锚点，明文来源只在站方手里；提前明确获取路径避免 M1 末才发现无法验收。凭据文件按宪法 VI 敏感值对待。
- **Alternatives considered**: 仅用哈希对比验证算法正确性（能证算法、证不了端到端登录）；请用户批量改密（违反"无感"初衷）；否决。

## 汇总：NEEDS CLARIFICATION 清零

spec 无遗留 [NEEDS CLARIFICATION]；本文件 12 项决议中 R1/R3/R5/R12 为新识别的实现层关键决策，其余为规划基线的落地细化。全部与宪法八原则相容（见 plan.md Constitution Check）。
