# acore-portal — AI Agent 规范（AGENTS.md）

> 本文件是所有 AI 编码代理（Claude Code / Codex / Cursor 等）的统一上下文与规范来源，遵循行业 agents.md 约定。
> 创建: 2026-10-23 · 技术栈标注为「规划基线」，选型定稿（docs/arch/00）后升级为「结论」。

## Project overview

老克塔（lokta.cn）官网重开发：魔兽世界 60 年代怀旧服（AzerothCore 引擎）社区门户，替代生产 WordPress 系统。四类职责：社区门户（资讯/论坛/直播）、游戏数据服务（排行榜/封禁记录）、玩家自助服务（开号/角色查询/物品恢复）、虚拟商品商城（积分支付 + SOAP 游戏内自动发货）。

**文档与状态**（按需阅读,勿全量加载）:

| 主题 | 位置 |
| --- | --- |
| 需求基准（定位/铁律/分期/不做清单） | docs/requirement/01-requirement.md |
| 全量功能规格（细节权威） | docs/requirement/02-功能规格说明书.md |
| 数据迁移映射/选型建议/决策记录 | docs/research/01-数据迁移与技术方案.md |
| 里程碑状态（**状态真相源**） | docs/plan/development-plan.md |
| 需求条目级状态流转 | 飞书需求池 https://my.feishu.cn/base/EPfDb63bPaBqQTsD5oBc6ztqnwh |

## 关键业务约束（违反视为事故级）

1. **三条铁律**：① 站点用户名 = 游戏账号名，注册同步写 acore_auth 库；② 一切密码/账号变更必须双写（站点 + 游戏 auth 库）；③ 商品 SKU `itemsend_{游戏物品ID}` 是商城与游戏世界的映射契约
2. **密码无感迁移**：存量 6,330 用户为**双格式混合**（phpass `$P$` 58% + WP6.8 `$wp$` bcrypt 42%，2026-10-23 实测）；登录按格式前缀分派校验，`$P$` 通过后重哈希为 `$wp$` bcrypt（一人一次零感知；`$wp$` 存量零接触）（specs/001 research R1/R2；research/01 §3 勘误注记）
3. **SOAP 发货必须可靠可见**：支付成功→扣分→发货→订单 completed 状态机闭环；失败进重试队列 + 告警 + 人工补发，禁止静默（现状 1,895 单滞留是反面教材）
4. **积分账本一致**：余额必须可由流水重算推导；每笔流水实时更新余额 + 日终对账任务双保险
5. **路由兼容**：旧 URL（`?p=`/`?page_id=`/`/wp-login.php` 等）必须 301/302，教程页截图与外部引用硬编码了旧路径（规格 §14）
6. **生产只读**：生产 101.42.117.123 在运行；游戏库凭据仅存 env，不入库不入文档；旧仓库 `~/Code/acore-cms` 切换下线前勿动

## Tech stack（规划基线，待定稿）

- **框架**: Next.js 全栈单体（React 18 + TypeScript 5 + App Router + Tailwind）——6K 用户规模，单体优先
- **ORM**: Prisma——新业务库可写迁移；游戏三库（characters/world/eluna）只读 client；auth 库可写
- **数据**: MySQL 8.4（业务库）· Redis 7（session/限速/热点缓存）
- **集成**: node-soap（worldserver 命令层：超时/重试/幂等/审计）· nodemailer SMTP · Cloudflare Turnstile · 腾讯云 COS+CDN
- **认证**: JWT HttpOnly Cookie + Redis 会话；记住登录 = 长 token + 轮换
- **部署**: 现有轻量服务器 docker compose + caddy；备份 = cron mysqldump + 对象存储
- **包管理器**: pnpm（定稿时确认）

## Setup commands

```bash
pnpm install                                   # 安装依赖
cp .env.example .env                           # 环境变量(SOAP/SMTP/游戏库凭据不入库)
make up                                        # 本地 MySQL(1 实例 5 逻辑库) + Redis + Mailpit + SOAP mock
pnpm db:generate                               # 生成 5 个 Prisma client(business/auth/characters/world/eluna)
pnpm db:migrate                                # 业务库迁移
pnpm db:seed                                   # 开发种子数据(scripts/dev/seed.ts)
pnpm soap:mock                                 # 本地 SOAP worldserver 模拟(开发/联调用)
pnpm dev                                       # 开发服务器
make check                                     # 质量门禁: lint + typecheck + vitest(224 用例)
pnpm test:e2e                                  # Playwright E2E(59 场景, 含路由兼容 301/商城结账/内容前台/论坛/状态卡)
pnpm verify:soap                               # SOAP 通道连通性自检(连真实 worldserver 或 mock)
pnpm verify:sc001                              # SC-001 老用户双格式登录验收(读 workspace/verify-credentials.txt)
```

E2E 默认连 dev 库；dev 库灌过存量迁移数据后与服务类 SKU 冲突，用独立 schema 隔离跑（一次性建库授权后三条命令，webServer 继承 DATABASE_URL）：

```bash
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm db:deploy
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm db:seed
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm test:e2e
```

以上命令均已验证可用（M2 收口 2026-10-24 核对 package.json scripts 与 Makefile）。`db:deploy` 供生产/CI 用 `migrate deploy`。

测试环境（Mac Mini 常驻栈,公网 dev.17aitech.com → frpc → 宿主 9000）：

```bash
docker compose -f docker/docker-compose.test.yml up -d --build   # 起栈(mysql 3308/redis 6382 均只绑 127.0.0.1,web 0.0.0.0:9000)
cp .env.test.example .env.test                                   # 环境变量(gitignore 永不入库)
DATABASE_URL="mysql://acore_portal:acore_portal@127.0.0.1:3308/acore_portal" pnpm db:deploy   # 业务库迁移
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD acore_portal' < scripts/dev/initdb/init-system-config.sql   # 系统配置种子(宿主机默认值,容器内栈按文件尾注释 UPDATE;真实 SMTP 凭据不入库)
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD' < scripts/migrate/wp-users-import.sql   # 存量用户导入(先 gzcat 备份 dump 导 wp_legacy 临时库,见 SQL 头注释)
```

## Project structure

```
prisma/          # schema + migrations（业务库唯一 schema 真相源）
src/
├── app/         # App Router：路由/页面/Route Handlers(API)，薄层，业务下沉 server/
├── server/      # 服务端业务：services/(业务编排,含 services/shop/handlers/ 服务类商品处理器;M3 域 content/progression/forum/status/media/home) soap/(游戏命令层)
├── components/  # React 组件（展示层，禁止直连数据库）
├── lib/         # 基础设施：db/(prisma clients×5) redis/ auth/(phpass+session) mail/ captcha/
├── constants/   # 全局枚举与常量（订单状态/积分类型/SKU 前缀/SOAP 命令名），被所有层引用
└── styles/
scripts/         # 宿主机侧脚本,按用途分子域
├── dev/         # 开发辅助(seed/initdb fixture/SOAP mock)
├── verify/      # 验收自检(soap-check/sc001-login)
└── migrate/     # WP→新库数据迁移(清洗/对账 SQL 与脚本)
docker/          # 部署资产:Dockerfile + compose(dev 本地/test Mac Mini 测试栈;生产 compose 上线时同置于此)
tests/           # 测试
workspace/       # 宿主机持久化数据（gitignore 不入库）
docs/            # 文档中心
```

**依赖方向（强制）**: `app → server → lib → constants`；`components → lib`；`constants` 不引用任何业务层。禁止反向 import、禁止循环依赖；客户端组件禁止 import `server/`（用 `server-only` 包强制）。

**目录规范（2026-10-23 CodeReview 沉淀，借鉴 acore-manager/ai-invest）**:
1. **目录即架构**：新增一级/域目录须先修订本节（借鉴 acore-manager《代码目录结构规范》守门做法）
2. **services 分域**：`services/` 根目录禁新增平文件，新域一律 `services/<域>/`（现有 auth/points/shop/orders/catalog/users-admin/images/account/mail/token/audit/routes/content/progression/forum/status/media/home 均此模式）；跨域基础服务（审计/outbox/token/账本/路由映射/游戏身份）入 `services/shared/`（借鉴 ai-invest 按子域分包、根目录禁平文件；M2 T004 已完成存量平文件归位）
3. **RSC 页面禁直连 prisma**：app/ 下页面只做 校验/会话/编排，数据组装收敛 service 层（页面私有取数函数放 `services/<域>/`）
4. **components 准入**：`components/ui/` 只收 ≥2 个消费者的通用组件；页面私有组件与 page 同目录（colocation）；域组件入 `components/<域>/`
5. **业务域服务禁互引**：`services/auth` 与 `services/shop` 等域间不直接 import，经 `services/shared/` 或上层编排（防循环依赖，借鉴 ai-invest）
6. **配置分域收口**（宪法 v1.0.2）：env 仅存引导级凭据（业务库/Redis 连接串 + SESSION_SECRET），统一经 `lib/env.ts` 校验；游戏四库连接串与业务通道配置（SMTP/SOAP/app.url/Turnstile/COS 等）存业务库 `system_config` 表，统一经 `lib/config.ts` 读取（启动预热 + 进程内缓存；游戏库 client 惰性建连，改连接需重启；管理端改通道配置后调 `reloadSystemConfig`），禁止散点直读 `process.env`、禁止在新代码引入 env 版业务配置

## Code style

- **通用**: KISS / YAGNI / DRY；SOLID 相关时应用；优先行业标准库而非自定义实现；现代框架特性优先
- **文件组织**: 小而专注、单一职责；单文件 ≤350 行，超限即拆；工具/常量/类型/组件/业务逻辑分离；组合优先于继承
- **命名约定**:

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 文件/目录 | kebab-case | `item-restore.ts` `soap-client/` |
| React 组件 | PascalCase | `ProductCard.tsx` |
| 函数/变量 | camelCase | `restoreItem()` |
| 常量/枚举 | UPPER_SNAKE_CASE + `as const` | `ORDER_STATUS.completed` |
| DB 表/字段 | snake_case（Prisma model PascalCase + `@@map`） | `point_transaction` |
| API 路由 | kebab-case | `/api/item-restore` |
| 游戏库表 | 保持原样，禁止改动 acore 库 schema | `wp_*`/`item_template` |

- **TypeScript**: strict 模式；`any` 需注释理由；对外部数据（游戏库/SOAP 返回）定义类型收口，禁止裸 any 透传
- **常量分层**: 业务枚举（订单状态/积分流水类型/服务处理器 SKU 路由键）一律进 `src/constants/`，禁止散落硬编码；SOAP 命令名集中一处定义

## Error handling

- 使用具体错误类型而非泛型；错误带上下文记录；对外错误信息不暴露系统内部
- 外部通道（SOAP/SMTP/游戏库）调用必须有超时 + 重试 + 失败落库（可追踪），失败状态对运营可见
- 服务类商品处理器统一错误约定：前置校验失败 → 用户可读原因；执行失败 → 重试队列 + 告警

## State & data rules

- 每个状态片段一个真相来源：积分余额 = 流水推导（余额表仅为加速读取的缓存，必须可重算校验）
- 订单状态机：`pending → paid → delivering → completed / delivery_failed(+重试)`；禁止出现发货后无限期停留中间态
- 缓存失效策略明确（Redis session/热点数据写明 TTL 与失效时机）
- Prisma migrations 是业务库 schema 唯一真相源；迁移 forward-only，合并后禁止修改；破坏性变更走 expand-contract 分批
- 游戏四库 schema 归 AzerothCore 管，本项目只读（auth 库仅按契约写账号表），禁止任何 DDL

## Security

- 永远不信任外部输入，边界处校验（Zod 或同级别 schema 校验，定稿时确认）
- 配置分域（宪法 v1.0.2）：env 仅存引导级凭据（业务库/Redis 连接串、SESSION_SECRET）；游戏库连接串与业务通道配置存 `system_config` 表（`lib/config.ts` 收口），凭据值禁止打印/落日志/入文档；日志记事件不记敏感值（令牌/密码/个人信息）；安全事件（登录失败/限速/越权尝试）记审计日志
- 服务端强制校验：角色归属（防越权下单他人角色）、SKU↔物品存在性、邀请码状态机
- Turnstile 人机验证 + 登录限速为登录/注册硬性要求

## Testing

- 定稿基线：Vitest（单元/集成）+ Playwright（关键链路 E2E：注册→登录→下单→发货）
- 每次行为变更必须附带测试；M1-M4 各里程碑验收锚点（development-plan.md）必须有对应自动化验证用例
- 提交前：`make check` 全绿

## Git & workflow

- 未经用户批准不 commit、不 push；多功能迭代按逻辑单元分批 commit，不打包巨型 commit；重推用 `--force-with-lease`
- 状态只更新 docs/plan/development-plan.md（里程碑粒度）+ 飞书需求池（条目粒度），不回填过程
- 每轮迭代完成后执行 CodeReview 三维度：① 规范性（命名/硬编码/常量分层）② 封装性（职责单一/边界/收敛重复）③ 架构合理性（依赖方向/无越层/无循环）；问题清零方可收尾；Review 发现的规范缺口回写本文件（事故驱动沉淀）
- 行为变更同步 docs 对应章节；架构定稿后按 project-init 第 6 步为各代码一级目录建专属 AGENTS/CLAUDE 上下文
