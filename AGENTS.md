# acore-portal — AI Agent 规范（AGENTS.md）

> 本文件是所有 AI 编码代理（Claude Code / Codex / Cursor 等）的统一上下文与规范来源，遵循行业 agents.md 约定。
> 技术栈标注为「规划基线」，选型定稿（docs/arch/00）后升级为「结论」。

## Project overview

老克塔（lokta.cn）官网重开发：魔兽世界 60 年代怀旧服（AzerothCore 引擎）社区门户，替代生产 WordPress 系统。四类职责：社区门户（资讯/论坛/直播）、游戏数据服务（排行榜/封禁记录）、玩家自助服务（开号/角色查询/物品恢复）、虚拟商品商城（积分支付 + SOAP 游戏内自动发货）。

**文档与状态**（按需阅读,勿全量加载）:

| 主题 | 位置 |
| --- | --- |
| 需求基准（定位/铁律/分期/不做清单） | docs/requirement/01-requirement.md |
| 全量功能规格（细节权威） | docs/requirement/02-功能规格说明书.md |
| 数据迁移映射/选型建议/决策记录 | docs/research/01-数据迁移与技术方案.md |
| 里程碑状态（**状态真相源**） | docs/plan/development-plan.md |
| 终态架构方案 | docs/arch/00-总体架构设计.md |
| 生产发布 / 备份恢复 | docs/ops/production-deploy.md · docs/ops/backup-restore.md |
| 需求条目级状态流转 | 飞书需求池 https://my.feishu.cn/base/EPfDb63bPaBqQTsD5oBc6ztqnwh |

> **仓库是 public 仓**：文档不得出现其他内部项目名、本机路径、生产 IP、registry 命名空间（口径见记忆条目「公开仓文档脱敏口径」）。
> `specs/`（里程碑 SDD 过程产物）**不入 git**，只在本地工作区；交付形态与验收锚点以 `docs/plan/development-plan.md` 为准。

## 关键业务约束（违反视为事故级）

1. **三条铁律**：① 站点用户名 = 游戏账号名，注册同步写 acore_auth 库；② 一切密码/账号变更必须双写（站点 + 游戏 auth 库）；③ 商品 SKU `itemsend_{游戏物品ID}` 是商城与游戏世界的映射契约
2. **密码无感迁移**：存量 6,330 用户为**双格式混合**（phpass `$P$` 58% + WP6.8 `$wp$` bcrypt 42%，实测）；登录按格式前缀分派校验，`$P$` 通过后重哈希为 `$wp$` bcrypt（一人一次零感知；`$wp$` 存量零接触）（权威口径见 research/01 §3 勘误注记；本地 `specs/001` research R1/R2 不入库）
3. **SOAP 发货必须可靠可见**：支付成功→扣分→发货→订单 completed 状态机闭环；失败进重试队列 + 告警 + 人工补发，禁止静默（现状 1,895 单滞留是反面教材）
4. **积分账本一致**：余额必须可由流水重算推导；每笔流水实时更新余额 + 日终对账任务双保险
5. **路由兼容**：旧 URL（`?p=`/`?page_id=`/`/wp-login.php` 等）必须 301/302，教程页截图与外部引用硬编码了旧路径（规格 §14）
6. **生产只读**：生产主机在运行；游戏库凭据仅存 env，不入库不入文档；旧 WordPress 仓库切换下线前勿动

## Tech stack（规划基线，待定稿）

- **框架**: Next.js 全栈单体（React 18 + TypeScript 5 + App Router + Tailwind）——6K 用户规模，单体优先
- **ORM**: Prisma——新业务库可写迁移；游戏三库（characters/world/eluna）只读 client；auth 库可写
- **数据**: MySQL 8.4（业务库）· Redis 7（session/限速/热点缓存）
- **集成**: node-soap（worldserver 命令层：超时/重试/幂等/审计）· nodemailer SMTP · 腾讯云验证码 TCaptcha · 腾讯云 COS+CDN
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
make check                                     # 质量门禁: lint + typecheck + vitest(141 文件 / 1150 用例)
pnpm test:e2e                                  # Playwright E2E 关态档(257 场景 / 37 文件, 含路由兼容 301/商城结账/商品增强(含列表快速编辑)/内容前台(含内容区底色/下载锚点/侧栏吸顶/快捷操作指南静态页+308)/侧栏快捷入口后台/渐进计划后台(含配图本地上传)/论坛管理(tab 双区+发帖回帖)/状态卡/工具页/通知/看板/SEO/商品运营 MCP(令牌签发/鉴权/作用域/配额/论坛运营工具链))
pnpm test:e2e:captcha                         # E2E 开态档(E2E_CAPTCHA=1;腾讯云验证码无官方测试密钥,本档只跑人机校验专项)
pnpm verify:soap                               # SOAP 通道连通性自检(连真实 worldserver 或 mock)
pnpm verify:sc001                              # SC-001 老用户双格式登录验收(读 workspace/verify-credentials.txt)
```

E2E 默认连 dev 库；dev 库灌过存量迁移数据后与服务类 SKU 冲突，用独立 schema 隔离跑（一次性建库授权后三条命令，webServer 继承 DATABASE_URL）：

```bash
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm db:deploy
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm db:seed
DATABASE_URL="mysql://acore_portal:<pw>@localhost:3307/acore_portal_e2e" pnpm test:e2e
```

以上命令均已验证可用（M2 收口时核对 package.json scripts 与 Makefile）。`db:deploy` 供生产/CI 用 `migrate deploy`。

测试环境（Mac Mini 常驻栈,公网 dev.17aitech.com → frpc → 宿主 9000）：

```bash
docker compose -f docker/docker-compose.test.yml up -d --build   # 起栈(mysql 3308/redis 6382 均只绑 127.0.0.1,web 0.0.0.0:9000)
cp .env.test.example .env.test                                   # 环境变量(gitignore 永不入库)
DATABASE_URL="mysql://acore_portal:acore_portal@127.0.0.1:3308/acore_portal" pnpm db:deploy   # 业务库迁移
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD acore_portal' < scripts/dev/initdb/init-system-config.sql   # 系统配置种子(**宿主机默认值**,覆盖写;容器内栈须跟下一行;真实 SMTP 凭据不入库)
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD' < scripts/dev/initdb/zz-init-system-config-container.sql   # 容器内取值覆盖(游戏库/SOAP/SMTP 的宿主机地址 ⇒ 容器服务名;全新数据卷首启时由 initdb 自动执行)
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD' < scripts/migrate/wp-users-import.sql   # 存量用户导入(先 gzcat 备份 dump 导 wp_legacy 临时库,见 SQL 头注释)
```

生产环境（独立 compose，不含 mailpit/soap-mock/initdb；部署全流程见 docs/ops/production-deploy.md）：

```bash
cp .env.prod.example .env.prod                                                  # 引导级凭据(gitignore 永不入库)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build   # 起栈(仅 80/443 对外)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml --profile migrate run --rm migrate   # 业务库迁移(容器网络内跑,DB 不发布端口)
TARGET_COMMIT=<发布提交> DEPLOY_ROOT=<检出根> bash scripts/deploy.sh --env prod --build-local   # 人工兜底发布(CI 不可用时才用;常规发布走 CI 的 push main + 审批;与 CI 同源一份脚本,含迁移台账断言与失败回滚,手册见 docs/ops/production-deploy.md §7.1)
```

## Project structure

```
prisma/          # schema + migrations（业务库唯一 schema 真相源）
src/
├── app/         # App Router：路由/页面/Route Handlers(API)，薄层，业务下沉 server/
├── server/      # 服务端业务：services/(业务编排,含 services/shop/handlers/ 服务类商品处理器;M3 域 content/progression/forum/status/media/home) soap/(游戏命令层)
├── components/  # React 组件（展示层，禁止直连数据库）
├── lib/         # 基础设施：db/(prisma clients×5) redis/ auth/(phpass+session) mail/ captcha/ net/(客户端 IP 解析纯函数)
├── constants/   # 全局枚举与常量（订单状态/积分类型/SKU 前缀/SOAP 命令名），被所有层引用
└── styles/
scripts/         # 宿主机侧脚本,按用途分子域
├── dev/         # 开发辅助(seed/initdb fixture/SOAP mock)
├── verify/      # 验收自检(soap-check/sc001-login)
├── ops/         # 线上运维/事故响应脚本(强制改密等;只走 service 层原语,不直写凭据);另含 archive-indexes.sql(wp_legacy 存档库分析索引 DDL,一次性人工执行;改的是源库故不在 migrate/)
├── migrate/     # WP→新库数据迁移(清洗/对账 SQL 与脚本);migrate/lib/ = 连接与口径共享层(db.mjs 连接串/schema 前缀、admin.mjs 切换期管理员引导),migrate/rehearse.mjs = 迁移链编排器(权威顺序),migrate/reconcile.mjs = 全链统一对账断言器
└── ci/          # CI 环境自举(游戏四库结构+WP 存量库空壳 / system_config 基线;只供 GitHub Actions)
docker/          # 部署资产:web/Dockerfile + caddy/Caddyfile + 三套 compose
├── docker-compose.dev.yml    # 开发栈(本地依赖:mysql/redis/mailpit/soap-mock)——严禁用于生产
├── docker-compose.test.yml   # 测试栈(Mac Mini 常驻:mysql/redis/mailpit/soap-mock/web)——严禁用于生产
└── docker-compose.prod.yml   # 生产栈(mysql/redis/web/caddy + 一次性 migrate)——不含任何测试替身
tests/           # 测试
workspace/       # 宿主机持久化数据（gitignore 不入库）
docs/            # 文档中心
```

**依赖方向（强制）**: `app → server → lib → constants`；`components → lib`；`constants` 不引用任何业务层。禁止反向 import、禁止循环依赖；客户端组件禁止 import `server/`（用 `server-only` 包强制）。

**目录规范（CodeReview 沉淀，借鉴内部同族项目）**:
1. **目录即架构**：新增一级/域目录须先修订本节（借鉴内部同族项目的《代码目录结构规范》守门做法）
2. **services 分域**：`services/` 根目录禁新增平文件，新域一律 `services/<域>/`（现有 auth/points/shop/orders/catalog/users-admin/images/account/content/progression/forum/status/media/home/notification/stats/settings/seo/sidebar/tools/site/security/search/assistant/mcp 均此模式；二期规划域：feed 内容聚合，**目录随对应里程碑落地时创建**，落地前先在此登记）。跨域基础服务**只**入 `services/shared/`、不再单独占业务域目录，当前为审计 `audit`、发信队列 `mail-outbox`、用户 token `user-token`、积分账本 `ledger`、积分通知 `points-notify`、路由映射 `route-map`、游戏身份 `game-identity`、站点身份 `site-identity`、审计去重 `audit-dedup`、AI 模型条目与角色绑定 `ai-models`（借鉴内部同族项目按子域分包、根目录禁平文件）。**域间横向 import 由 eslint-plugin-boundaries 机械拦截**：域服务只能引用 `services/shared/*` 与 `eslint.config.mjs` 中 `ORCHESTRATION_EDGES` 登记的编排边，未登记直接 lint 失败（issue #6）
3. **app 层禁直连 prisma**：app/ 下 RSC 页面与 Route Handler（`src/app/api/**`）只做校验/会话/编排，数据组装一律收敛 service 层（页面私有取数函数放 `services/<域>/`）；`grep -rn 'from "@/lib/db"' src/app` 应为空
4. **components 准入**：`components/ui/` 只收 ≥2 个消费者的通用组件；页面私有组件与 page 同目录（colocation）；域组件入 `components/<域>/`；禁止另起 `app/_components/` 等第四类目录。展示组件保持无 IO——需要会话/库数据的异步壳放页面层（取数经 `services/<域>/` 的 view 函数，如 `getSidebarView`/`getArchiveView`/`getSiteHeaderView`），组件只接收 props
5. **业务域服务禁互引**：`services/auth` 与 `services/shop` 等域间不直接 import，经 `services/shared/` 或上层编排（防循环依赖，借鉴内部同族项目）
6. **配置分域收口**（宪法 v1.0.2）：env 仅存引导级凭据（业务库/Redis 连接串 + SESSION_SECRET），统一经 `lib/env.ts` 校验；游戏四库连接串与业务通道配置（SMTP/SOAP/app.url/腾讯云验证码/COS 等）存业务库 `system_config` 表，统一经 `lib/config.ts` 读取（启动预热 + 进程内缓存；游戏库 client 惰性建连，后台改连接串后经 `resetGameDbClients()` 重置缓存免重启；管理端改通道配置后调 `reloadSystemConfig`），禁止散点直读 `process.env`、禁止在新代码引入 env 版业务配置。**例外（2026-11-17 LLM 通道重构）**：结构化多行配置（AI 模型条目/角色绑定）落专表 `ai_model`/`ai_role_binding`（一行一条目、一行一角色，扁平键表达不了），读取收口 `services/shared/ai-models/`（resolver 每请求直查库，改绑/停用即时生效），条目密钥沿用规则 12 secret 口径（明文落库 + API 只写不读）；**站点日 Token 上限的默认值三处字面量（代码常量 / Prisma `@default` / 迁移 DDL DEFAULT）由守卫 `tests/unit/ai-model-guard.test.ts` 锁死**，改一处必改三处。⑦ **宿主机默认种子禁对已运行的容器栈执行**——`init-system-config.sql` 是 `ON DUPLICATE KEY UPDATE` 覆盖写，写的是**宿主机**地址（游戏库 `localhost:3307` / SOAP / SMTP `localhost`）；对容器栈执行会把容器内可达的地址覆盖成「容器自己」⇒ web 容器启动自检失败（unhealthy）⇒ 发布健康检查判失败、连回滚也起不来（2026-11-15 测试环境发布失败即此因）。容器可达性地址由 `zz-init-system-config-container.sql` 单点翻译（initdb 按文件名序最后执行；已运行的栈手动执行同一个文件），**禁两处各写一份**；守卫 `tests/unit/stack-config-guard.test.ts`
7. **compose 三分**：`docker/` 下 dev/test/prod 三套 compose 各自独立成文件，禁止跨环境复用服务定义。**生产栈（`docker-compose.prod.yml`）禁含测试替身**——`mailpit`（生产接真实 SMTP）、`soap-mock`（生产 `soap.url` 指真实 worldserver）、`scripts/dev/initdb` 挂载（含种子账号 `m1admin/adminpass123`）三者一律不进生产；生产 DB 不发布端口（迁移走 `--profile migrate` 一次性服务，备份走 `docker exec`）。新增测试用容器时同步在 prod 文件头部的「刻意排除清单」登记原因与替代方案。**同理，prod compose 禁挂载「已下线/已废弃的外部栈」目录**（旧 WP 栈的 uploads 目录已随切换下线，其挂载已移除）——外部资产消失时 compose 不会报错、只会让容器起不来（2026-11-15 生产事故，见规则 10 ⑫）
8. **启动钩子依赖图无 node-only 包**：Next 14 会为 `src/instrumentation.ts` 额外编译一份 edge 产物，其传递依赖图内出现 `ioredis`/`mysql2`/`node:*` 等 node-only 包 → edge 编译报 `Can't resolve 'stream'`，**next dev 与 next build 双双失败**（PR-0 曾因此静默炸掉整个 E2E，根因离报错点隔了三层 import）。因此：启动链可达的模块（`shared/audit.ts`、`shop/delivery.ts` 等）只许依赖 prisma，Redis 依赖另立文件（`shared/audit-dedup.ts`）。守卫：`tests/unit/instrumentation-graph.test.ts`（红测试，新增 node-only 依赖即失败）
9. **后台内链一律 `prefetch={false}`**：后台页面是动态路由（会话/DB），Next 14 对它们的视口预取**只回约 120B 存根**（不含页面数据），且 hover 也不触发完整预取——即预取对点击零收益，只徒增每页 15~25 个请求（实测 `/admin` 36→11 个请求）。`src/app/admin/**` 与 `src/components/admin/**` 内的 `/admin*` 链接一律显式 `prefetch={false}`；指向站外公开页的链接（`/post/*`、`/forum/thread/*`）保留默认预取
10. **测试栈自动部署；生产栈 push main 触发 + 审批放行**（沉淀，改生产触发形态）：`push develop` 且门禁 + 迁移守卫全绿 → 自托管 runner（Mac Mini）执行 `scripts/deploy.sh --env staging`（拉 TCR 镜像）滚动 web；**生产栈**在 `push main` 后由同一次流水线的 `deploy-production` 进入待部署队列、经 `environment: production` 的审批放行后发布（理由见 `docs/ops/production-deploy.md` §7.2，手册见 `docs/ops/staging-deploy.md`）。十一条硬约束：①**数据与密钥在 git 检出之外**——部署根走仓库变量 `DEPLOY_ROOT`（其下含 `.env.test` 与 `workspace/` 持久卷根），compose 的路径与镜像 tag 参数化，部署根不参与 checkout 清理；②**只重建 web**，禁止 `down -v` / 删卷 / `git clean -x`；其他服务只在**声明配置漂移**时被 compose 归位重建（如 redis 换 digest 引用、服务改名这类历史差），**数据卷一律 bind mount 原地复用、从不删除**；③**迁移 forward-only**，回滚只回镜像不回数据库；④**新迁移必须可手工重放**（MySQL DDL 非事务，中途失败要重放 SQL）——守卫 `scripts/ci/check-migration-idempotency.ts`（MySQL 口径：MySQL 无 `CREATE INDEX IF NOT EXISTS` 这类 MariaDB 语法，索引/列守卫走 `information_schema`）；⑤本机路径与主机名一律走 `vars.*`，不进 YAML（公开仓口径）；⑥**栈内服务用 `env_file` 取库连接串，禁 `${DATABASE_URL}` 插值**——compose 插值优先级 shell env > `--env-file` > `.env`，CI 作业级 env 里的 `DATABASE_URL`（CI 自己的 MySQL 服务容器）会盖掉 `.env.test`，插值出来的回环地址在容器网络内不可达（首次自动部署即栽在这：migrate 报 `P1001`）；⑦**构建信息走构建期内联，禁运行期 env**——页脚版本行的构建时间与提交短号由 `scripts/ci/build-meta.sh`（构建元信息单一来源，显式东八区，CI 与本地兜底构建共用）产出，经 `scripts/deploy.sh`（本地构建模式）以 `--build-arg` 传入，`docker/web/Dockerfile` 里 `ARG` → `ENV NEXT_PUBLIC_*` → `next build` 固化进产物（常量口径见 `src/constants/version.ts`）；值与镜像绑定，不会出现「容器 env 与镜像产物说法不一致」；`NEXT_PUBLIC_*` **必须写字面量**（Next 只内联 `process.env.XXX` 的字面量，动态拼键不被替换）；⑧**生产发布 = push main 触发 + environment 审批**——`push main` 后 `docker-release` 构建 amd64 镜像并推 TCR（tag = `main-<短号>`，短 tag 不可变⇒可精确回滚），同一次流水线的 `deploy-production` 进入**待部署队列**，由 `environment: production` 的审批放行后经 SSH 跑 `scripts/deploy.sh --env prod --tag main-<短号>`；**不再保留 `workflow_dispatch` 手动触发入口**——两道人工确认（手动触发 + 审批）同属一人、第二道无增量安全性，且手动入口会让「main 已合并但生产没跟上」变成静默漂移（实测生产落后 main 23 个提交而无人察觉）；push 触发后每次合并都留下一条待部署记录，漂移是看得见的待办。作业失败用 Actions 页的 Re-run failed jobs 重跑，不另留手动通道。**CI 不可用时的人工兜底**是同一份 `scripts/deploy.sh --build-local`（人登机器执行：现场构建镜像，其余语义与 CI 完全一致）；该模式**不执行任何 git 变更**（只校验发布资产根 HEAD 已是目标提交且无未提交改动，拉代码由人做——发布脚本改仓库状态会破坏「回滚 = 回到上一个提交重新构建」这条人工回滚路径的前提）；⑨**部署脚本只有一份**——`scripts/deploy.sh` 是测试栈 / 生产栈 / CI 发布 / 人工兜底的**唯一实现**（旧的 `scripts/ops/deploy-production.sh`、`scripts/ops/deploy-staging.sh` 已删，两套流程并存必然漂移）：① **两条根目录**——「发布资产根」（compose 文件 + `prisma/schema-business` 迁移集 + 构建上下文，**必须与本次发布的镜像同源同一 commit**）与 `DEPLOY_ROOT`（env 文件 + `workspace/` 持久卷根，数据与凭据在 git 检出之外），CI 侧两者不同源是正常的：资产来自流水线检出，数据来自常驻部署根；② **迁移台账断言**做三集合比对——应用集（迁移服务实际会应用的迁移集）⊆ 台账（`_prisma_migrations` 已完成且未回滚）且镜像集（镜像内 `/app/prisma/schema-business/migrations`）⊆ 应用集，且台账无未完成行；任一不满足即**在换容器前**中止——「漏跑迁移 / 检出比线上旧 / 发布资产与镜像不同源」三类事故当场暴露，而不是等新代码运行期才炸；③ **只换 web**（`up -d --wait --no-deps --no-build web`），数据卷原地复用；④ 状态统一落 `.deploy-state`（旧的 `.deployed-sha` / `current-sha` 已废）；⑩**E2E 不挂在 push 上**——`e2e.yml` 只留 `pull_request` + `workflow_dispatch`：推 main 那次与「develop→main 的 PR 已跑过同一 commit」重复，且 `deploy-production` 不以 E2E 为前置，留着只是白烧 CI；合并前的回归门禁由 PR 触发承担，同一 PR 内新推提交自动重跑（concurrency 取消上一轮）；⑪**发布链路禁现下载依赖、禁依附 SSH 会话**（沉淀，2026-11-14 生产发布失败 exit 255 + 发布耗时 28 分钟的根因）：① **迁移工具镜像内置**——`migrate` 一次性服务复用 web 镜像（`image: ${WEB_IMAGE}`），prisma CLI 烘焙进 `docker/web/Dockerfile` 的 `/opt/prisma`（版本与 lockfile 锁定值一致）；早前用裸 `node:22-slim` + `npx --yes prisma@6.19.3` 在生产机上现下载，国内链路实测 ~170KB/s、整步 15 分 34 秒且全程零输出，`run --rm` 又不留 npm 缓存 ⇒ 每次发布都重下一次；**发布链路不得依赖外网下载**；② **远端发布与 SSH 会话解耦**——CI 与生产机的全部远端交互收敛在 `scripts/ci/remote-release.sh` 一份实现：远端 `setsid` 后台执行、退出码落 `$DEPLOY_PATH/.deploy-exit`，CI 轮询该文件判成败并回显 `$DEPLOY_PATH/.deploy-log` ⇒ SSH 断连不中断发布（CI 崩了远端照样跑完）；所有 ssh/scp 一律带 `ServerAliveInterval=30`/`ServerAliveCountMax=6`——产线 sshd 是 `clientaliveinterval 0`（不杀空闲会话）而链路有 15 分钟空闲 TCP 超时，不带保活会把发布掐在半路（2026-11-14 即栽在这：迁移步骤静默 15 分 → 空闲超时 RST → 远端 `deploy.sh` 随 SIGHUP 中断）；③ **镜像构建必须有层缓存，且缓存落在常驻 builder 而非 GitHub 缓存服务**——层缓存由**常驻 builder（`ci-builder` 容器）的本地层缓存**承担（`release-image.yml` 走 `docker buildx use ci-builder`，**不配 `cache-from/cache-to: type=gha`**）；2026-11-15 实测：GHA 缓存导出要把数 GB 构建缓存推去 GitHub，写层阶段 20 分钟零进展 ⇒ 步骤 25 分钟超时 ⇒ 作业判红，**而镜像早在 3 分 41 秒就推完了**；单 runner 场景下那份导出纯开销，只有换机器才需要。同提交的第二次构建靠本地缓存 2 分 28 秒完成（依赖层可复用）；**禁对 `ci-builder` 执行 `docker buildx prune`**（会连层缓存一起清掉，下次退回全量重建），**禁用 `setup-buildx-action`**（临时 builder 不保留层 store）；换架构（arm64 ↔ amd64）须各自重建一次，属预期代价；④ **密钥契约是「路径」不是 secret 正文**——`remote-release.sh` 的 `DEPLOY_SSH_KEY`/`DEPLOY_KNOWN_HOSTS` 取**文件路径**（默认 `~/.ssh/deploy_key`、`~/.ssh/known_hosts`），脚本自己预检 `[ -f ... ]`；CI 侧先把 secret 落盘到那两个默认路径，**再调脚本时不得把 secret 正文当路径传**（传正文的直接死于预检「私钥不存在:<正文>」——2026-11-14 生产发布即栽在这；旧的前台 ssh 直跑写法用的是字面路径，故契约错位不显形，直到收敛成脚本才暴露）。守卫 `tests/unit/release-pipeline-guard.test.ts`；排障入口：发布卡住先看远端 `.deploy-log`（Actions 侧只有轮询回显），超时退出码 124 表示远端**可能仍在跑**，勿重复触发发布；⑫**换容器前必须断言挂载源可用，且禁挂载已下线栈的目录**（沉淀，2026-11-15 生产发布把站点打挂的根因）：① **compose 不校验 bind 挂载源**——源路径若是**悬空符号链接**（指向已删除的目标），容器创建阶段直接 `mkdir: file exists` ⇒ 新容器起不来、**回滚也起不来** ⇒ 整站中断（该次事故：prod compose 仍挂旧 WP 栈的 `workspace/wp-uploads`，旧栈下线后链接悬空）；② `scripts/deploy.sh` 在**迁移台账断言之后、换容器之前**加 `assert_bind_mount_sources`：`docker compose config --format json` 取全部 bind 源逐个核对，**悬空符号链接 / 源与「运行中容器内目标类型」错配 ⇒ 中止发布**（旧版本继续服务），源路径不存在只提示（compose 会自动创建）；**单文件 bind 挂载（Caddyfile / nginx 模板）是合法用法，禁当错**——初版把「源不是目录」当致命错，同日发布即被自己的断言拦下（生产无损失，但发布链断）；判定抽成纯函数 `mount_source_verdict`（deploy.sh 内 `@extract` 标记段），单测 `tests/unit/deploy-mount-check.test.ts`；③ **已下线/已废弃的外部栈目录一律不挂**（旧 WP 栈的 uploads 目录已随切换下线，其挂载已从 prod compose 移除）——挂载是「发布期的硬依赖」，外部资产消失时无人会来通知，compose 不会报错、只会让容器起不来；④ **宿主侧运维脚本随发布资产下发**（`scripts/cron/*.sh` 在 `scripts/ci/remote-release.sh` 的 `ASSETS` 里）⇒ 宿主编排脚本与镜像内脚本同 commit，禁手工改宿主那份（两份不同源 ⇒ 排除参数漂移 ⇒ 备份恒判失败）
11. **GitHub 侧命名沿用本机既有惯例**：仓库变量用 `DEPLOY_*` 族（`DEPLOY_ROOT` / `DEPLOY_HOST` / `DEPLOY_PATH`）、密钥用 `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`、服务级前缀用 `TCR_*` / `SCF_*` / `TENCENT_*`——**不加仓库前缀**；自托管 runner 名 `macmini-<仓库名>`、只用默认标签（`self-hosted` / `macOS` / `ARM64`），每仓一份独立 runner 实例，故工作流里写 `runs-on: [self-hosted]` 即可
12. **后台配置项的敏感口径与测试连接**：① **敏感字段按「组+字段」登记**——`sensitiveMode(group, field)` 逐组声明，**禁回退到全局字段名集合**（新组里同名的 `password` 会被另一组规则误判）；两种模式：`secret`（只写不读，明文永不回显，空串=保持现值）与 `masked`（连接串回脱敏串，口令段以 `***` 占位）；② **取值解析唯一收口**——`settings/values.ts` 的 `resolveSubmittedValue`，保存与测试连接共用同一函数，禁止各自另写一套；③ **脱敏回显的坑**——提交串口令位仍是 `***` 时须用现值口令回填，否则只改 host 也会把 `***` 写进库；④ **测试连接用未保存的候选值**——SOAP/游戏库探测走候选参数（`rawExecuteCommand` 的 `conn` 覆盖、`probeGameDb` 临时 client），不落库即可验证，不允许「先落库再验证」留下半改状态；⑤ **审计只落通道名与成败**——任何连接参数与口令不入日志；⑥ **游戏库热重置的在途请求取舍**：重置会断开在途请求，属已知取舍，改动前在文档写明；⑦ **专表条目密钥同口径（2026-11-17）**——`ai_model.api_key`（规则 6 例外专表）沿用 `secret` 模式语义：明文落库、API 层只写不读（脱敏视图只回「已配置」布尔，不回掩码串）、空提交=保持现值、审计永不落密钥值
13. **外部通道的后台化口径（对象存储 / 工具站 / 备份）**：① **COS 以桶名为开关**——`cos.bucket` 留空=整组不生效（`config.cos` 为 `undefined`），填了桶名即启用，此时 `region/secretId/secretKey/cdnBase` 须齐全，缺项报 `VALIDATION_FAILED` 且**零写入**；桶名留空时其余项照旧留存，便于日后重新启用而不必重填密钥；② **密钥只写不读**——`cos.secretKey` 按规则 12 的 `secret` 模式登记，视图只回「已配置」不回明文，留空提交=保持现值；`secretId` 不是密钥，允许回显（便于识别用的是哪把密钥）；③ **缓存实例内含旧凭据，须随配置重置**——COS SDK 实例构造时即固化凭据，改配置后不丢弃缓存实例则换密钥不生效（`resetCosClient`）；游戏库四个 Prisma client 同理（`resetGameDbClients`），二者都是「改完免重启」的必要条件；④ **外部站点地址只存配置、不改代码**——rank 排行榜子站与 DKP 独立站的地址存 `system_config`（`tools.rankBase` / `tools.dkpUrl`），换环境只改后台，不重构建镜像；⑤ **测试连接只用只读探针**——COS 走 `headBucket`（读操作，无副作用无费用），禁止用写/删操作探活；⑥ **备份策略参数即 cron 的运行契约**——`backup.retentionDays` 由备份脚本每次运行读取，改这一项等价于改下次备份行为，故表单留空=保持现值（0 保留期在脚本里表示「只留当日」，不是「未设置」）
14. **商品 SKU 契约的交叉校验（发货只看 SKU，不看 `game_item_id`）**：① **SKU 是发货的唯一依据**——`itemsend_{id}` / `transmog-item_{id}` 由 SKU 解析物品 ID，`game_item_id` 只是元数据 ⇒ 两者不一致 = **静默发错物品**；② **SKU 由所选物品单向派生**（物品 → SKU），界面默认只读，手改只走「高级区」且服务端仍须复核——禁止让 SKU 与物品 ID 同时可手写；③ **服务端是最终闸门**——保存前跑 `validateSkuBinding`（纯函数，`src/constants/shop-sku.ts`）：物品类校验「SKU 解析出的物品 == 所选物品」，服务类校验「SKU 命中处理器注册表」；违规一律 422 且带 `field`（sku / gameItemId），不得静默放行；④ **游戏库不可达即 503 不放行**（`GameDbError`），不得在物品未经校验的情况下保存商品；⑤ **服务类副本键放行**——`-copy` / `-copy-N` 派生键可编辑（副本为何仍能发货见规则 16）；⑥ **物品检索只读 world.item_template 的 entry/name/quality/stackable 四列**，不擅自加列（生产 AC 真表列名未验证，加错会炸生产读取；`stackable` 已核对为 `int default 1`）；**中文名另取 `world.item_template_locale`**（生产 AC 真表已核对：主键 `(ID, locale)`、`Name text`，zhCN 即中文名；该表在精简游戏库可能不存在 ⇒ 服务层按「无本地化数据」降级为只显示英文名，不阻断检索、不报 503）；⑦ **存量不合规商品只体检不自动改**——`scripts/ops/audit-product-sku.sql` 是只读清单，由运营在后台逐个修
15. **后台商品编辑页的交互基线**：① **两栏编辑台**——主列分组卡片（基本信息 / 价格与库存 / 售卖窗口 / 展示与排序 / 详情）+ 右栏商品图片面板与商城预览；② **图片面板**——右栏大图可点即替换主图，缩略图条支持设为主图 / 上移 / 下移 / 移除，首图=主图；③ **字段级校验**——错误落到具体字段旁（红字 + `role="alert"`），提交被拦时给出汇总提示；④ **吸底保存条**——整页**有且仅有一个**可访问名含「保存」的按钮（Playwright strict mode 约束），保存态文案（保存中 / 已保存 / 出错）用非按钮元素承载；⑤ **未保存提示**——有改动即显示提示条，`beforeunload` 拦刷新/关闭（App Router 无路由级拦截，站内跳转靠提示条，勿假装有）；⑥ **服务类不提供自由文本 SKU**——SKU 只是商品唯一标识，界面由处理器下拉自动派生（发货依据见规则 16）
16. **服务类的发货依据独立于 SKU 落列（`-copy` 副本整改）**：① **SKU 只是唯一标识**——服务类商品的发货依据是 `product.handler_key`（发货处理器键），下单时快照到 `order_item.handler_key`；此前 SKU 既当标识又当处理器键，复制商品只能追加 `-copy` 后缀 ⇒ 副本命中不了处理器注册表 ⇒ **每个副本必然发不出货**（复制功能仅服务类可用，即副本 100% 坏）；② **整改方向是改数据模型，不是打补丁**——`-copy` 派生 SKU 照常存在（唯一性需要），但不再影响发货；③ **存量兼容**——迁移按 SKU 反查注册表回填 `handler_key`，缺省时回落「SKU 本身即注册键」的旧形态；④ **复制时处理器键随源商品继承**（副本与源商品发货行为一致）；⑤ **物品类不变**——`itemsend_{id}` / `transmog-item_{id}` 的发货依据仍是 SKU 本身（规则 14）
17. **服务类限购语义：单次 1 件 + 发货完成后释放额度**：① 服务类是一次性服务（改名 / 转种族 / 解锁名字），**单次购买恒限购 1 件**（加购 qty>1 即拦），后台表单对服务类锁定「每人限购 = 1」；② **额度在发货完成后释放**——用户改了名字下了单，改完还想再改一次应当允许（订单态 `completed` 释放；在途 `paid` 仍占用）；③ **三处口径一致**——加购 / 改数（软拦截）+ 结账事务内（强制关，失败零写入回滚）
18. **可堆叠物品的 SKU 契约（买多个 = 一封邮件堆叠）**：① `world.item_template.stackable`（AC 真表 `int default 1`，1 = 不可堆叠，>1 = 可堆叠）决定发送形态——`_stack` 后缀 = **一封邮件发 qty 个**（发货层早已支持），无后缀 = qty 封各 1 个（AC `Item::CreateItem` 超 maxStackSize 会静默钳制）；② **选物品即派生**——选择器读到 `stackable > 1` 时自动勾选「一封邮件发多个」并派生 `itemsend_{id}_stack`；③ **保存期强制**——可堆叠物品缺 `_stack` 一律 422 `SKU_STACK_REQUIRED`，把「买多个被发成多封邮件」的口径前移到保存期；④ 只读 world 表，不加列不改 schema
19. **运营告警通道：飞书自定义机器人 webhook**：① **失败必须让人看见**——发货落到 `delivery_failed` 即推飞书卡片（非阻塞，不阻断发货主流程），落实「失败进重试队列 + 告警 + 人工补发，禁止静默」；② **只报首次**——人工重试再失败不重复打扰（按订单态跃迁判定，不按尝试次数）；③ **通道配置进后台**——webhook 地址与签名密钥存 `system_config` 的 `notify` 组，密钥按规则 12 的 `secret` 模式只写不读，并带独立启用开关；④ **边缘安全**——签名用 Web Crypto（`crypto.subtle` + `btoa`），**禁 `node:crypto`**（启动链可达模块禁 node-only 依赖，规则 8）；⑤ **2xx 不等于成功**——飞书业务拒绝码（如 19021 签名不符）按失败处理，瞬时错误（5xx / 网络）重试一次
20. **后台表格的窄屏排版口径**（沉淀，issue #48）：① **窄屏靠横滚，不靠折行**——后台表格统一用共享组件 `components/ui/table.tsx`（外壳 `overflow-x-auto` + 表体 `min-w-[680px]`），表头 `Th` 一律 `whitespace-nowrap`；禁止为「塞进一屏」而允许中文逐字竖排（表格基本不可读）；② **单元格按内容定折行策略**——日期/时间/金额/ID/状态等不可拆分的值加 `whitespace-nowrap`；长文本（商品名、备注）用 `truncate` 或保留折行但**不逐字断**（`min-w-0` + 换行点由文案自己控制）；③ **新表格不另起炉灶**——用 `Table/THead/Th/Tr/Td` 组件，不手写 `<table>`/`<th>`（手写就会漏掉表头不折行这条）；④ **操作区在窄屏要能排下**——批量按钮等一排动作在窄屏用两列网格（`grid-cols-2 sm:flex`），不靠 `flex-wrap` 挤出参差的一行
21. **商品 FAQ（常见问题）的口径**（沉淀，issue #159）：① **按商品维度，不做全站 FAQ**——`product_faq` 挂 `product_id`（`ON DELETE CASCADE`），前台按 `sort` 升序取；② **排序是数据不是数组序**——`sort` 字段落库，重排按传入 id 顺序**重写 sort**（不是交换两值），保证与前台读序、服务端列表序三处一致；重排**必须覆盖该商品全部问答**（只传子集会让子集 sort 与未传行撞值、顺序被静默打乱，一律拒）；③ **审计只记 id**——`product_faq_saved` / `product_faq_deleted` 的 payload 只带 `productId` / `faqId`，**问答正文不入审计日志**（沿用 T048 脱敏口径）；④ **归属校验不可省**——改删时用「productId + faqId」双条件命中，跨商品访问一律 NOT_FOUND（不因知道 id 就放行）；⑤ **管理界面独立成页**——`/admin/products/[id]/faq`，不塞进商品编辑表单（避免触发「整页唯一『保存』按钮」的 E2E strict mode 约束）；⑥ **行内草稿按行独立**——每行自持 question/answer 草稿与保存态，失败不丢草稿；行 `key` 只用稳定 id（**不要把内容拼进 key**——保存后 refresh 会改 key 导致整行重挂载、「已保存」提示被冲掉）；⑦ **迁移写法**——MySQL 无 `CREATE INDEX IF NOT EXISTS`，索引与外键**内联在建表语句**里，让 `CREATE TABLE IF NOT EXISTS` 命中时整句跳过，兼顾幂等重放与 `migrate diff` 无漂移
22. **前台用户侧编辑器口径**（沉淀，论坛编辑器升级）：① **面向普通用户的编辑器一律 Vditor IR**（`mode:'ir'`，Typora 式即时渲染），代码层存纯 Markdown；后台管理员编辑器维持 @uiw/react-md-editor 不变（两套并存，禁互相迁移）；② **运行时资产必须自托管**——实例配 `cdn:'/vditor'`，资产经 `scripts/build/copy-vditor-assets.mjs`（挂在 `dev`/`build` 脚本链首，白名单拷贝到 `public/vditor/`，gitignore 不入库）加载，**禁 unpkg 等外部 CDN**（国内不可达）；**资产拷贝禁入 `postinstall`**——postinstall 在 Docker「manifest 先行分层安装」层里没有源码文件可用必炸（部署事故），且行业惯例 postinstall 只动 `node_modules`、不向源码树写产物；③ **颜色只用受限色板类标记**——Markdown 无颜色语法，统一 `<span class="c-x">` 类标记；新增颜色 = `src/constants/forum-palette.ts` 常量 + `lib/markdown.ts` sanitize 类名白名单 + `globals.css` 双作用域样式**三处同步改**，`style` 属性始终全局剥离（XSS 真闸门在服务端 rehype-sanitize，编辑区关闭 Lute sanitize 只为色板标记渲染）；**编辑区实时着色须 retag 预览层**（用户反馈）——IR 模式把内联 HTML 渲染成隐藏标记节点（`span[data-type=html-inline]` 内 `code.vditor-ir__marker`），正文是夹在开/闭标记间的裸文本节点，CSS 无法命中 ⇒ 上色后编辑区视觉零变化；解法是在 `input`/`after` 回调里（`processAfterRender` 块重渲染后 DOM 已终态）把「开标记..闭标记」整段包进 `<span class="c-x" data-palette>`，Lute 序列化（VditorIRDOM2Md）只读标记节点文本、对包裹层零感知（往返无损已实测）；**已知上游怪癖（非本层回归，已对照实证）**：光标落在隐藏标记附近时 End 键定位与 undo 表现异常（鼠标点击定位正常），系 vditor 对隐藏标记的光标归一化问题，勿误归因到 retag；④ **图片上传统一走 `/api/forum/upload` handler**——工具栏/粘贴/拖拽同路（`upload.handler` 接管返回 null）；⑤ **React 集成坑**——StrictMode 双挂载必须**每挂载周期独立子节点** + `after` 回调身份闸门（vditor `destroy` 会清空挂载元素 innerHTML，共享挂载点会互相抹掉；未就绪实例不能调用任何实例方法）；自定义工具栏项必须**自定义 click**（IR 的 `processToolbar` 只认固定命令名，prefix/suffix 在 IR 落空；click 的 vditor 参数是内部对象无原型方法，须经组件 ref 拿公共实例后 `insertMD`）；⑥ **E2E 口径**——填编辑器必须 `keyboard.insertText`（`fill` 的 execCommand 路径与 vditor 内部态失同步，后续工具栏操作会静默失效）；单次 insertText 不触发 vditor 块内重渲染（上游行为），须补一次按键触发再 Backspace 撤销；vditor 工具栏 aria 名（如「删除线 <⌘D>」）与业务按钮（「删除」）在 `getByRole` 子串匹配下冲突，按钮定位须 `exact: true`；上传项是 `div[data-type="upload"]` 内嵌 input（非 button），文件派发直接对 `input[type=file]`；⑦ **窄屏工具栏口径**（用户反馈「工具栏 8 行占满编辑区」）——vditor 工具栏无内建响应式折叠，17 个按钮按块级自然换行 ⇒ CSS（≤640px）改 **flex 单行横滑**（微信/知乎等移动端编辑器行业惯例）：`flex-wrap:nowrap + overflow-x:auto`、隐藏分隔符、字数 counter sticky 贴右，末位按钮截断即「可滑」视觉提示；**弹层（`.vditor-hint`，色板/标题下拉）在横滑容器内必被 overflow 裁剪**（一轴 auto 另一轴 visible 计算值也是 auto），且按事件钩落位不可行——vditor 自身 click 处理会 `stopPropagation`（祖先层气泡监听收不到）、开面板路径存在异步（capture+microtask 时序不稳，实测有选区/无选区走不同路径）⇒ 窄屏弹层改 `position:fixed`（配 `width:max-content` 防 fixed 后可用宽=视口-left 导致菜单行宽随定位漂移；箭头伪元素随默认定位设计，重定位后不再指向按钮，隐藏），坐标由组件 **MutationObserver 盯弹层 style 翻转**落位（display 变 block 的瞬间，观察回调在绘制前的微任务点运行，零闪烁、与 vditor 内部时序解耦；写回同值守卫防观察自触发），落位到工具栏下方并按视口夹紧；**横滑即收起**（fixed 弹层不随滚动项移动，留着只会悬空）；桌面端（>640px）走 vditor 默认绝对定位零改动（观察回调里 matchMedia 分支顺带清 stale inline 坐标）

23. **用户头像口径与前台窄屏排版**：① **头像唯一口径是名字缩略图**——页头与账号总览统一走 `components/site/user-avatar.tsx`（名字首字符 + 职业色底，`constants/characters.ts` 的 `characterAvatar`），**禁随机角色头像**（原 `services/shared/portrait.ts` 按 `ORDER BY RAND` 抽样 + Redis 60s TTL ⇒ 用户看到头像一直变，且与账号总览不一致；该服务已删除）；游戏角色头像（种族图）只在「我的角色」页按角色展示，与用户头像不是一回事；② **会话载荷不含用户名**——session 只有 `{userId, role, jti}`，页头取昵称须查 `prisma.user`（`getSiteHeaderView` 内 `Promise.all` 并行，失败降级空名），不为此扩 JWT 契约；③ **前台窄屏信息区纵向排版**——账号总览这类「头像 + 若干标签值 + 统计块」的行，窄屏改纵向（`flex-col md:flex-row`）+ 标签/值成对结构（标签 `shrink-0`、值 `min-w-0` + `overflow-wrap:anywhere`），统计块 `whitespace-nowrap` 独占一行，不与信息行抢宽导致折行；④ **前台表格窄屏靠横滚**——沿用规则 20 的口径（`overflow-x-auto` 外壳 + 表体 `min-w-*` + 表头/数值/时间列 `whitespace-nowrap` + 备注列留可折行空间），但前台表格**不套用后台 `components/ui/table.tsx`**（该组件写死后台配色）；⑤ **长值断行口径不变**——邮箱等长 token 用 `overflow-wrap:anywhere` + `word-break:keep-all`（#43 口径，优先自然边界断行）

24. **归档列表的封面图与统一背景容器口径**（沉淀，资讯/公告/资料梳理用户反馈）：① **前台列表页必须是单一 `bg-panel` 容器**——条目间不露站点背景图（页面背景图是全站装饰层，孤立条目卡会视觉割裂）；`archive-page.tsx` 三种布局共用此口径：cards 外层容器包住栅格（条目自身无边框，hover 高亮），rows/log 用分隔线模式（容器 `overflow-hidden rounded-xl border border-line bg-panel` + 条目 `border-t first:border-t-0`）；新增前台列表页照此办理，**禁再造孤立条目卡**；② **列表封面 = `bodyMd` 首图**——Article 无封面列，封面从正文首个图片提取（markdown `![]` 或内联 `<img>`，`articles.ts` 的 `extractCoverFromBody`）；**域白名单判定唯一收口在 `lib/markdown.ts` 的 `isAllowedImageSrc`**（渲染硬闸 `rehypeImageAllowlist` 与封面提取共用——列表封面可见 ⇔ 详情页正文图片可见，白名单外域图不做封面），禁在别处另写前缀判断；无图文章回落纯文字卡，不强造占位图；③ **前台封面用原生 `<img>`**（站点口径，无 next/image remotePatterns 负担）：`aspect-[16/9] w-full object-cover` + `loading="lazy"`，alt 取文章标题

25. **首页精选商品的登录门控与排序管理口径**（沉淀，精选商品用户反馈）：① **登录门控**——首页右栏「精选商品」区仅登录用户可见（`src/app/page.tsx` 用 `getServerSession` 包整区），口径同顶部菜单「积分商店」；页面快捷入口列表用 `authOnly` 标记统一拦截，**不要在链接渲染处另写角色判断**；② **排序是数据不是数组序**——`product.featured_sort` 落库，管理台（`/admin/home` 精选卡）重排按传入 id 顺序**重写全量** dense 0..n-1（沿用规则 21 的 FAQ 口径），子集一律拒（`SET_MISMATCH`→409 提示刷新），移出后剩余重写连续序；③ **加入 = `max+1` 追加末位**——所有把商品置为精选的入口（快速编辑、商品表单保存、管理台加入）统一走 `catalog/admin/products.ts` 的 `nextFeaturedSort`，新精选不打乱首页既有顺序，**禁止散点各自取序**；④ **服务归属**——精选管理编排在 `services/home/featured.ts`，`nextFeaturedSort` 放 `catalog`（boundaries 编排边 home→catalog 单向，catalog 不得反向引 home）；⑤ **审计**——`PRODUCT_FEATURED_SAVED`：加入/移出记 productId+sku+featured，重排只记 orderedIds（正文类信息不入审计）；⑥ **首页回退语义**——精选不足 4 件时以最新上架商品补位（`getHomeBlocks` 既有逻辑），管理台空态文案与此对齐，勿在管理台另造"必填精选"约束

26. **UI 基础组件的 className 合并必须走 tailwind-merge**（沉淀，后台商品筛选条各占一行用户反馈）：① **根因**——`Input`/`Select` 等组件内建默认类含 `w-full`，调用方追加 `w-auto`/`w-52` 等宽度类时字符串拼接无法去重，而 Tailwind 同属性两个类按**生成顺序**决胜（实测构建产物中 `.w-full` 恒排最后）⇒ 内建 `w-full` 恒赢、调用方宽度覆盖全部静默失效，筛选条每项 100% 宽各占一行；② **口径**——`components/ui/` 基础组件合并外部 className 一律 `twMerge(内建类, className)`（tailwind-merge 会按后者优先消解同组冲突），**禁再写模板字符串拼接**；新增内建默认宽度等可被调用方覆盖的类时同样适用；③ **排查手法**——同属性类冲突不报错不告警，只能实测 DOM 宽度或查构建产物中类的先后顺序（`.next/static/css/`），定位「布局与写的类不符」时优先怀疑此类冲突；④ **新增/改动的后台组件一律走语义 token，不写 arbitrary-hex**——后台历史存量仍有大量 `text-[#xxx]` 原始色值（逐步替换），但新代码禁再铸硬编码色值：一律用站点主题语义 token（`text-body` 次级正文 / `text-muted` 弱化说明 / `text-link` 链接 / `text-heading` 标题 / `border-line` 描边 / `bg-panel-strong` 面板底 / `text-ok-bright` 成功 / `text-danger` 失败），装饰性渐变可保留字面量

27. **后台「列表类管理台」的统一交互口径**（沉淀，侧栏管理台 UX 重构用户反馈）：① **折叠行 + 展开编辑**——条目多于 3 个的管理台禁用「全部常驻平铺表单」（满屏裸输入框，用户不知从何下手）；一律折叠行列表（序号 + 标题 + 摘要 + 编辑/上移/下移/删除），点「编辑」展开结构化表单，**新增条目自动展开**直接可填（轮播物料/精选商品/商品 FAQ/侧栏快捷卡四管理台统一此形态）；② **字段必须带可见标签**——禁用只有 placeholder 的裸输入框行（placeholder 输入即消失、且多个同外观框无从分辨——侧栏「客户端下载」卡标题框与链接文字框内容相同正是此坑）；③ **前台可预览的卡片类编辑须配实时预览**——预览样式类**直接复用前台组件的类名**（token 经 `@theme inline` 全局可用，零漂移且随主题联动），放展开编辑器右栏；④ **同页多区块须讲清概念与顺序**——同一页承载多种编辑对象时（如侧栏=自定义快捷卡+内置组件），区块按**前台实际渲染顺序**排列、每区首行白话说明定位（「系统功能卡，内容自动生成、不可编辑，只能选择显示页面」）、内置/系统项加徽章区分；⑤ **整页唯一「保存」按钮 + 未保存提示**（沿用规则 15 口径），保存态文案与「有未保存的修改」用非按钮元素承载；⑥ **行操作区统一「图标次操作 + 短文字」**（沉淀，快捷卡按钮不对齐反馈）——上移/下移一律 lucide `ChevronUp`/`ChevronDown` 图标按钮（ghost sm，可访问名走 `aria-label="上移「名称」"`，E2E 以 role+name 定位），破坏性动作用短文字 danger 按钮（「删除」），**禁带条目名的长文字按钮**（宽度随名称变化，行间右缘参差）；操作区收 `shrink-0` 单行容器、行容器去 `flex-wrap`（标题侧 `min-w-0 flex-1` truncate 让位），保证各行操作区宽度恒定、右缘严格对齐

28. **获取类积分的发放口径**（沉淀，point_rule 后台管控 + 注册送分时机）：① **规则表驱动 + 后台可管**——获取类事件（注册/徽章）走 `point_rule` 表，分值与开关由后台「积分规则」页（`/admin/point-rules`）管控，缺行保存即 upsert 补种；消费（`shop_payment`）与手调（`manual_adjust`）是固定账务路径，**不经规则表**（`assertEarnEvent` 守门）；② **注册送分在认证通过时入账**——注册受理只建占位账号，占位账号登录不了，注册即发分等于发一份用不了的分；送分与激活设密**同事务**（不能出现「密码已生效但积分没发」，失败须回滚游戏端凭证并释放 token 让用户重试）；③ **流水描述须与实际发放条件一致**——`point_transaction.remark` 写明赠送条件与分值（如「新注册并认证通过的账户赠送 2 积分」），分值取规则表实际值（后台可改，描述里的数字不得写死）；④ **规则行缺失即不发分**——`getEarnAmount` 对缺行/停用返回 0，因此规则表须由迁移补种基线，不能只靠 dev seed（生产库不跑 seed ⇒ 新注册静默 0 分，线上已复现）

29. **论坛版主能力与状态口径**（沉淀，加精/已关闭/请补充用户反馈）：① **状态单一出口**——`forum_thread.status_label` 与 `closed_at` 必须同写同清（`services/forum/moderate.ts` 的 `writeThreadStatus` 是唯一写入口），徽标、回帖闸（`forum/write.ts` 读 `closed_at`）、筛选三处都读这一对，**禁再开第二条状态写路径**（两处表达一个状态必漂移）；② **状态下拉是唯一出口**——四态（无标签/已解决/请补充/已关闭）都在下拉里，选「已关闭」即关帖、切回其他标签即重开；「关闭主题/开放」按钮只是同一动作的一键快捷方式，**禁把下拉在关闭态锁死**（能进不能出=非对称）；后台筛选同理——状态只有「状态标签」下拉一个入口，**禁再挂「仅已关闭」chip**（同一集合两个入口必漂移）；③ **徽标唯一出口**——状态徽标走 `components/forum/thread-badge.tsx` 的 `ThreadStatusBadge`（`closed_at` 非空时优先显示「已关闭」），加精徽标走 `FeaturedBadge`（「精」），置顶走 `PinnedBadge`；前台首页/论坛/版块/主题详情/后台列表的徽标渲染统一复用，**禁各处另写内联标记**；④ **加精与置顶互不干扰**——`featured` 独立列独立审计（`FORUM_THREAD_FEATURED`），首页「论坛精华」排序按加精优先→置顶→热度；⑤ **「请补充」必须能触达发帖人**——标记时同事务落站内信（`notification.type=forum`，带主题详情页链接），作者未映射（存量帖 `author_user_id=null`）无从寻址、版主标记自己的帖不通知自己；**状态已改但提示没发**属事故，同事务才能杜绝；⑥ **枚举变更走迁移**——`status_label` 是 MySQL ENUM，增删取值必须 `MODIFY COLUMN`（先 `UPDATE` 收敛旧值再改列，否则旧值不在新枚举域内会失败），迁移须满足重放幂等（`pnpm lint:migrations`）；旧值语义不明（如原「规范」）时**照旧剥离标题前缀但不落标签**，不新造语义；⑦ **批量设状态复用同一写路径**——后台主题列表多选后批量设状态（`services/forum/moderate.ts` 的 `bulkSetThreadStatus`）与单条共用事务内写入口 `writeStatusInTx`：状态双写（`status_label`+`closed_at`）、逐条审计（`forum_thread_label` + `bulk` 标记）、「请补充」逐条提示发帖人，**禁另开批量专用写路径**（两条路径迟早漂移）；批量工具条的下拉同样只列四态（与行内下拉同口径），已软删主题跳过不复活，单次上限 200

30. **纯 JS 交互控件的水合门控**（沉淀，E2E 偶发「按钮永远 disabled」事故）：① **受控 `<select>` 在水合前会丢变更**——水合前用户/自动化改动只落到 DOM 值，React 的 `onChange` 未挂载 ⇒ 组件状态不变 ⇒ 由状态派生的按钮（如「角色分配」）恒 disabled，**页面看不出任何异常**；② **门控用 `lib/use-hydrated.ts` 的 `useHydrated()`**——水合完成前 `disabled` 该控件（`disabled={busy || !hydrated}`），既杜绝丢事件，也让「可选中/可点击」本身成为水合完成的信号；③ **E2E 同步点写「等 enabled」而非固定 sleep**——`await expect(locator).toBeEnabled()` 即水合完成的断言（dev 模式路由冷编译时水合可慢到数秒，固定 sleep 不可靠）；④ **排查此类症状先看 trace 的 frame-snapshot**——DOM 里 `<option selected>` 已变而 React 状态未变，就是水合丢事件，不是业务 bug

31. **时间口径：存储 UTC、展示东八区、自然日按北京日切**（沉淀，2026-11-14 全站时间 review）：① **存储一律 UTC**——业务库 DateTime 列存 UTC 瞬时（MySQL 会话时区 = UTC，Prisma 写 UTC），**禁存墙钟**；墙钟只允许出现在「展示层」与「WP 存量源」两处；② **展示一律走 `src/lib/format.ts`（唯一出口）**——`formatDate`/`formatDateTime`/`formatTime` 固定 `Asia/Shanghai` + `h23`；**禁**裸 `toLocaleString`/`toLocaleDateString`/`toISOString().slice` 取日期，也**禁** `getFullYear`/`getMonth`/`getDate` 等本地时区分量（裸调用把展示时区交给运行时环境变量——换个没配 `TZ` 的容器就整体偏 8 小时；`toISOString` 取 UTC 则让北京 00:00–08:00 的内容显示成前一天）；守卫 `tests/unit/date-display-guard.test.ts`（含「`new Intl.DateTimeFormat` 未钉 `timeZone` 即违规」，格式化器只允许在 `lib/format.ts` 内构造）；③ **自然日 = 北京自然日**——「今天/昨日/近 N 天」与日桶（埋点日汇总、看板区间比较、404 日键、访客盐、峰值日键、订单号日期段、上传路径日期段）统一用 `beijingDayStart`/`beijingDateKey`/`beijingDayKeyCompact`；SQL 里按北京日切用 `CONVERT_TZ(created_at,'+00:00','+08:00')` 固定偏移（不依赖 MySQL 时区表是否载入）；④ **容器 `TZ=Asia/Shanghai` 只是便利不是保证**——compose 里的 `TZ` 曾是「日键正确」的唯一依赖，口径必须写在代码里，不许靠环境变量兜底；⑤ **存量迁移只认 GMT 列**——WP `post_date`/`post_modified` 是**站点本地墙钟**，一律改取 `post_date_gmt`（零值回退 `post_date - 8h`），换算收在 `scripts/migrate/lib/time.mjs` 一处（禁在脚本里另写偏移）；`wp_users.user_registered` 本就是 GMT，不做偏移；`FROM_UNIXTIME` 按会话时区折算，须 `CONVERT_TZ(...,'+00:00')` 回 UTC；⑥ **改迁移脚本不会自动修好已导入的存量行**——导入按 legacy 键幂等跳过，须一次性回填脚本 `scripts/ops/fix-legacy-timezone.sql`（以 wp_legacy 真值回填 ⇒ 幂等，重跑零变更；附改前/改后差量与孤儿行核对段）；⑦ **构建元信息同理**——页脚构建时间取 `scripts/ci/build-meta.sh`（显式东八区），不随构建机时区漂移

32. **后台列表的展示维度须与列所属实体一致**（沉淀，后台订单列表角色列用户反馈）：① **维度对齐**——一行 = 一笔订单 ⇒ 该行的角色列只能展示「**这笔单买给了哪个角色**」，不是「这个账号名下有哪些角色」；把账号维度的数据摆进订单维度的列，运营分不清这单发给了谁（实测一列四个角色名，其中三个与本单无关）；② **真相源取该单自己的数据**——订单的目标角色落在 `order_item.params.characterGuid`（下单时刻落定，发货处理器读的就是它），解析键须从「账号」换成「订单行 params」；shared 层按 guid 批量取名（`game-identity` 的 `listCharacterNamesByGuids`），**禁**再写「用户名 → 账号 → 账号全部角色」这条链路；③ **降级不许编造**——角色已删除或角色库不可达时回落展示 guid（`#13364`），**不回落成「账号全部角色」**（拿噪音掩盖缺失）；④ **同账号多角色是常态**——一个账号挂多个角色是常规配置，凡按账号取角色的列表都会列出无关角色，须有用例守住（造「同账号两个角色、单单只买一个」的用例，断言列表只列本单目标角色）

33. **备份机制的口径（沉淀，生产备份与恢复演练落地）**：① **范围只含门户站点侧**——业务库每日 + `wp_legacy` **一次性**（切换后存量只读冻结、数据不再变化，周备只是重复压同样的字节，改上线时手工备一次）；游戏四库由游戏侧部署工程每日备份，本仓不重复备份、也不承担游戏库恢复责任；② **职责按容器切开，禁合并成一个脚本**——宿主既无 mysql client（不能 dump）也无 node_modules/COS SDK（不能上传）⇒ dump 在 mysql 容器内、上传与校验在 web 容器内，宿主只做编排（`scripts/cron/backup-run.sh`）；③ **成功判据五项全过才算一次有效备份**——压缩包体积达下限 / gzip 可完整解开 / dump 有 mysqldump 完成标记 / dump 覆盖源库全部基础表 / COS 对象大小与本地一致且清单写入成功；任一不满足 ⇒ **不写清单**（坏备份不进台账）+ 删掉已传对象 + 告警 + 非零退出；④ **清单即台账**——`backups/manifest.json` 记录对象键/字节数/sha256/表名/**锚点表行数**/完成时刻，恢复演练按锚点行数逐项核对，判据口径与脚本同源（`scripts/cron/backup-lib.ts` 纯函数层，禁在脚本与文档各写一份）；⑤ **心跳与备份分离**——备份脚本「成功」不等于「按时跑过」（crontab 没挂、容器起不来、脚本被改坏都会静默不跑），心跳脚本读清单最新完成时刻、超 26 小时告警；⑥ **告警降级不影响备份**——通道未配置/故障时只记日志，备份流程照常（与发货通道同口径）；⑦ **恢复演练在非生产机跑**——一次性 MySQL 容器 + 行数核对 + 即销毁，不碰生产库、不接应用连接串；⑧ **凭据只在内存**——dump 用容器自身环境变量、上传用 `system_config` 的 `cos.*`，不落宿主命令行、不打印、不入文档；⑨ **排除表与保留期都按目标分**——`BACKUP_EXCLUDE_TABLES` 排除存量库的 `wp_statistics_*` 三张统计表（占存量库 73% 体积且是访问统计衍生数据，丢了不影响恢复能力），且**排除清单与判据的源表基线必须同源**（否则被排除的表被判成「dump 缺表」⇒ 每次必失败）；`keepForever` 标记的存量库不参与保留期清理（日备的清理线不扫一次性归档）；⑩ **保留期分层，桶生命周期是兜底**——脚本保留期是策略（`backup.retentionDays`，上限 365 天），COS 生命周期 365 天是兜底（脚本不跑时桶自己删），兜底线必须 ≥ 任何可能的策略值，否则后台调大保留期而桶先把旧备份删了 ⇒ **设置会说谎**；生命周期规则只针对备份前缀（`scripts/ops/cos-lifecycle.ts` 写入，存量库与台账不设规则）

34. **AI 助手会话数据生命周期（沉淀，2026-11-18 存储健康度排查）**：① **检查点是全量快照，存储随轮次平方增长**——LangGraph `put` 每次落一份含 `channel_values.messages` 全量的状态快照，单会话占用随问答轮数呈平方级 ⇒ 沉睡会话不回收会把业务库撑爆（这是结构性的，不是配置问题）；② **保留期锚点取台账而非检查点**——`assistant_session.last_message_at`（最近活动时刻，已有索引）判超期，**不给检查点表加时间列**（检查点表按 `(thread_id, ns, checkpoint_id)` 主键组织，加列只是为迁就一个本可由台账回答的问题）；③ **删除路径唯一**——后台手动删除与超期自动清理共用 `services/assistant/session-cleanup.ts` 的原语（单事务清 `agent_writes` + `agent_checkpoint` + `assistant_session` 三处），**禁在别处另写一套删检查点的逻辑**（两条路径迟早漂移；守卫 `tests/unit/assistant-retention.test.ts` 扫全仓）；④ **清理逻辑不落 cron 脚本里**——cron 脚本只调服务层原语，禁自带 `deleteMany`；⑤ **孤儿检查点不自动清理**——有 checkpoint 无台账行（run 收尾写台账失败）者无时间列可判年龄，且可能是跑中的会话，自动清理会误删，只能由后台按 threadId 手工删；⑥ **清理频次按成本定**——检查点表有 `last_message_at` 索引 ⇒ 一次回收是索引扫＋批量删，秒级完成，**周频足够**（日频只是徒增扫描与锁竞争）；⑦ **审计只记量不记正文**——`assistant_session_deleted` 记 threadId 与删除行数，`assistant_sessions_pruned` 记回收会话数/行数/保留期，对话正文不入审计（沿用 T048 脱敏口径）；⑧ **清理结果同步飞书**——无人值守的定时任务必须让人看得见跑没跑：**每次跑都发一张卡**（有回收＝绿 / 无超期＝蓝，兼作「任务确实在跑」的心跳，否则「无事可清」与「任务没跑」长得一样），失败发红卡且退出码非零；**告警故障不牵连清理**——通道未配置或发送失败一律降级为只记日志（与规则 33⑥ 同口径）；卡片只落数量与时间，对话正文不入卡片；通道走统一的运维告警出口 `scripts/cron/ops-alert.ts`（**cron 脚本禁自带 fetch**，否则每个脚本各写一套通道口径）

35. **商品运营 MCP 通道的口径（沉淀，二期 M6；2026-11-19 增补论坛运营）**：① **MCP 只是后台能力的对外投影**——商品写入一律走 `services/catalog` 同一入口（`saveProduct` / `setProductStatus`），论坛写入一律走 `services/forum` 同一入口（`createReply` / `updateThreadTitle` / `deleteThread`），检索走 `services/search` 统一检索，**禁另写一套 CRUD**；域间引用须在 `eslint.config.mjs` 的 `ORCHESTRATION_EDGES` 登记（`mcp: ["catalog", "search", "forum"]`）；② **不因调用方是 AI 而放松校验**——SKU↔物品绑定、服务类处理器注册表、限购、可堆叠 `_stack` 后缀、论坛回帖 closed 闸与软删闸一律照旧（工具层不重复校验，校验留在 catalog/forum 入口内）；③ **SKU 只能派生不能手写**——物品类由所选物品 id 派生（可堆叠与否由游戏数据 `stackable` 决定，**不由调用方自选**）、服务类由处理器键派生；`update_product` 收到与现值不同的 `sku` 一律 422 `field=sku`（SKU 是发货契约，不给 AI 手改）；④ **不可逆操作不暴露**——工具表恒 12 个（商品 7 + 论坛 5），商品域**无任何删除入口**，删档回后台人工处理；论坛「下架」是**可逆软删**（前台不可见、内容保留、后台可恢复），故可暴露；恢复（undelete）与单删楼层不暴露，留后台人工；⑤ **令牌明文落库、按需取回**——MiniMax 式（2026-11-19 用户反馈）：明文落 `mcp.token`（与 SMTP/COS 密钥同库同权限，仅管理员会话可读）；**默认已有一枚**（进接入页自动补发，不必手动签发），页面只显示掩码串，「复制令牌」走单独动作取回明文并留审计（`mcp_token_copied`），后台视图永不含明文；⑥ **轮换即覆盖 + 无有效期**——同时只有一枚活跃令牌（轮换覆盖同一组 `mcp.*` 键），旧令牌即时作废；令牌**不设有效期**（无 TTL），风险靠「轮换」与「作用域只读」两道闸控，无独立吊销入口；⑦ **令牌状态键不进设置页的整组提交**——接入页虽在设置 Tab 内，但令牌与限额仍由 MCP 域直写 `system_config` + `reloadSystemConfig()` 热生效：设置页整组全量提交会覆盖组内所有键（会把令牌冲掉）；⑧ **失败文案统一**——令牌无效一律 401 且文案相同（「令牌无效。」；令牌无有效期，无过期分支），不区分失败原因以免被探测；⑨ **只读越权在路由层拒**——只读令牌调写工具直接 403，不靠工具层兜底（HTTP 状态语义须正确）；批量 JSON-RPC 数组**逐条**判作用域、逐条扣配额（防「改个 method 名绕过配额」）；⑩ **配额失败关闭**——令牌级 QPS 与日配额两道闸 Redis 不可用即 503（绝不放开无限调用）；未鉴权请求的 IP 兜底闸失败开放（只挡洪泛，不充当配额）；⑪ **审计只记 id 与结果**——`mcp_tool_called` 只记 `{tool, ok, targetId?, durationMs, errorCode?}`，**不记请求体全文、不记令牌/哈希**（沿用规则 12⑤ / T048 脱敏口径）；论坛改题审计记新旧标题（标题是公开内容，同 `forum_thread_created` 先例）；⑫ **禁任意 SQL / 通用表写入 / 文件操作**——工具只能调白名单注册表里的那 12 个动作；⑬ **论坛写操作实名与频控口径**——回帖/改题/下架的作者 = **令牌绑定的管理员**（`ctx.actorUserId` → `getSiteUsername`，未绑定一律 422 拒绝；实名落库可追责，改题审计记新旧标题）；MCP 回帖**不套用论坛路由层的用户级 Redis 频控**（30s/1 + 10/h 是普通用户防灌水闸），防滥用由通道自身的 QPS/日配额 + 全量审计兜底；`updateThreadTitle` 是 moderate.ts 的新原语（单一出口 + 审计），改题前论坛**不存在任何改标题路径**。⑭ **接入页要给服务地址与 agent 接入示例**——除令牌外还须给出 MCP 服务地址（由 `app.url` 派生）与常见 agent 的现成配置片段（Claude Code CLI / 通用 `.mcp.json` / WorkBuddy），否则用户拿到令牌仍不知道往哪填；示例里的令牌用掩码串占位，禁把明文写进页面文本。

36. **后台设置页的结构口径（沉淀，2026-11-19 用户反馈）**：① **设置页拆 Tab，一页一主题**——常规 / 游戏通道 / 邮件与告警 / 安全 / 存储与备份 / MCP 接入 / 积分规则各自独立路由（`/admin/settings/<tab>`，Tab 组件按最长前缀判激活），禁把所有配置堆成一张长页；② **常规页合成一张卡**——站点地址 / 站点信息 / 内容展示 / 站点外观 / 外部工具站五个分区合在一张卡内，行式布局（左标签+说明、右控件），**底部吸底唯一保存条**（整页有且仅有一个可访问名含「保存」的按钮，Playwright strict mode 约束）；③ **一次保存要顺序提交各分区**——服务端每次落库即重载 config 快照，故五个分区须**顺序** PUT（并行会留下只含部分新值的快照）；④ **独立功能域独立菜单项**——站点主题（`/admin/theme`）独立成侧栏菜单（系统组），不在设置 Tab 内：配色主题（色板）与「站点外观」（图片资源地址）是两件事；⑤ **主题预览只影响当前浏览器**——预览走短期 cookie（`theme_preview`）由服务端读取并覆盖当前主题与素材，库里的 `theme.active` 不变；⑥ **旧入口 308**——路由合并后旧地址用 `permanentRedirect` 永久重定向到新址，不静默 404；⑦ **E2E 同步点取「值变了」而非「状态徽标」**——轮换令牌这类异步动作，完成信号取掩码串变化（值变了）；状态徽标（如「生效中」）轮换前后同形，拿它当完成信号会读到上一枚旧令牌并断言假象（2026-11-19 排障即此因）。

37. **无人值守定时任务必须让人看得见（沉淀，2026-11-19 积分对账告警缺口）**：① **有差异也要发卡**——积分对账原先只落日志 + 退出码 2，而宿主上无人消费退出码 ⇒ 账实不一致事实上无人知晓（规则 34⑧ 同一原则，适用于全部 cron 任务，不限于会话清理）；② **每次跑都发一张**——有差异＝红卡（差异处数 + 明细，明细条数封顶、总数以字段给出）、无差异＝蓝卡（兼作「任务确实在跑」的心跳，否则「一切正常」与「任务没跑」长得一样）、脚本失败＝红卡；③ **结论与退出码不被告警牵连**——通道未配置或发送失败一律降级为只记日志（与规则 33⑥ 同口径），对账结论（0 一致 / 2 有差异 / 1 失败）与退出码不变；④ **通道单一出口**——走 `scripts/cron/ops-alert.ts`，**cron 脚本禁自带 fetch**（否则每个脚本各写一套通道口径）；⑤ **告警链需 react-server 条件**——飞书卡片与系统配置在 server-only 服务层，cron 启动须带 `--conditions=react-server`（`package.json` 的 `cron:*` 脚本与宿主包装脚本 `scripts/cron/reconcile-points-run.sh` 均已带），缺该条件时脚本降级为只记日志而不崩；⑥ **告警明细只落量与 id**——不落凭据、不落凭据口径的原始串。

38. **可选依赖库的口径（沉淀，2026-11-20 eluna 可选化）**：① **「未配置」与「配错」是两种语义，必须分开**——未配置＝该库不存在/不需要（自检**跳过**、`ok=true`、**不阻断启动**）；配了却连不上＝配置错误（`ok=false`、照旧 fail-fast）。把两者混为一谈，可选依赖的缺失会拖垮整个门户；② **可选性落在配置层**——schema 上该字段 `optional()`，`flattenToSchema` 把「键缺省 / 空串 / 纯空白」一律归一成 `undefined`（未配置），非空则原样交 schema 校验（非法 URL 仍 fail-fast）；③ **client 不得拿 undefined 建连接**——取用原语返回 `null` 表示未配置（不是 `undefined`、也不是拿 undefined 构造 client 在构造处炸）；④ **自检的「跳过」用独立标记**——`DbCheck.skipped=true` 与 `ok=true` 并存，探针返回值用 `"ok" | "skipped"` 哨兵而**不用 null**（`authDb.findByUsername` 对不存在的用户本就返回 null，会被误读成「跳过」）；⑤ **启动日志区分 probed 与 skipped**——「自检通过: a,b,c(未配置跳过: eluna)」，避免运维把跳过当成已自检；⑥ **后台要能表达「未配置」**——敏感口径新增 `masked-clearable`（同 masked，但**提交空串＝清除该配置**，落空串由配置层判为未配置），其余必需依赖的库仍是 `masked`（擦空＝保持现值）；⑦ **依赖它的功能按降级处理**——可选库缺失时走空态/降级，不得报错；⑧ **可选口径不外溢**——同组内的必需依赖仍 fail-fast，改一项不得放宽其余项。

39. **站内检索的 FULLTEXT 索引口径（沉淀，2026-11-20 检索召回静默漏召）**：① **症状是「搜得到老内容、搜不到新内容」，且全程不报错**——关键词路走 InnoDB FULLTEXT（ngram，`services/search/fulltext.ts`），索引进入失配态后**新插入的行不再进索引**，旧行照常召回 ⇒ 召回漏新内容时没有任何报错或告警，只能靠「最新一行是否已入索引」的体检发现；② **修复手段是 `OPTIMIZE TABLE`（整表 recreate，重建 FTS 辅助表）**——`ALTER TABLE ... DROP/ADD FULLTEXT` **无效**（复用同一份已损坏的辅助表，实测重建后新行依然搜不到），处置脚本 `scripts/ops/rebuild-fulltext-index.sql`（含只读体检段 + 重建段，幂等）；③ **触发条件不作因果断言**——本机实测与「存量迁移期批量删改」「MySQL 补丁版本原地升级」同期出现，但**均未能在隔离环境稳定复现**（清空表、批量删 5 万行、ALTER 加索引三种假设全部复现失败）⇒ 排查直接跑体检段，失配即重建，**不依赖对触发条件的假设**；④ **恢复后必做**——备份恢复到已有 schema 的行不进索引，恢复完成须跑一次重建（`docs/ops/backup-restore.md` §6.1）；⑤ **集成测试是真库守卫，禁因「本机环境问题」删用例**——`tests/integration/search-fulltext.test.ts` 正是靠「新插入的行能否被召回」才暴露了该失配（2026-11-20 实测：删用例＝把「索引失配」与「新内容搜不到」两件事一起藏掉）；⑥ **`OPTIMIZE TABLE` 持表锁**——生产库按低峰窗口执行，恢复/导入期间不要并发大批量写入（写入期间索引仍可能再次失配）。

## Code style

- **通用**: KISS / YAGNI / DRY；SOLID 相关时应用；优先行业标准库而非自定义实现；现代框架特性优先
- **文件组织**: 小而专注、单一职责；单文件 ≤350 行，超限即拆；工具/常量/类型/组件/业务逻辑分离；组合优先于继承
- **命名约定**:

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 文件/目录（含组件文件） | kebab-case | `item-restore.ts` `product-card.tsx` `soap-client/` |
| React 组件标识符（导出名） | PascalCase | `export function ProductCard`（文件仍为 `product-card.tsx`） |
| 函数/变量 | camelCase | `restoreItem` |
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
- 腾讯云验证码（TCaptcha）人机验证 + 登录限速为登录/注册硬性要求（由 Cloudflare Turnstile 替换：国内用户可达性，且两端依赖同一海外端点会让第三方抖动等于全站锁在登录门外）

## Testing

- 定稿基线：Vitest（单元/集成）+ Playwright（关键链路 E2E：注册→登录→下单→发货）
- 每次行为变更必须附带测试；M1-M4 各里程碑验收锚点（development-plan.md）必须有对应自动化验证用例
- 提交前：`make check` 全绿

## Git & workflow

- 未经用户批准不 commit、不 push；多功能迭代按逻辑单元分批 commit，不打包巨型 commit；重推用 `--force-with-lease`
- **发布形态：特性分支 → develop → main**（`develop` 集成分支、`main` 生产分支）：
  - 任何新改动一律从特性分支 **PR 进 `develop`**，禁止直接 PR 进 `main`（`main` 的 PR 只能以 `develop` 为 head）
  - **发布到生产 = `develop` → `main` 一步**：开 **head 直接是 `develop`** 的 PR 合进 `main`（常态 develop ⊇ main，合并即发布，无内容漂移、无空合并）
  - **`main` 反向同步进 `develop` 是条件动作，不是发布必经步骤**：仅当 `main` 出现 `develop` 没有的提交（热修复直提 `main`）才需要开同步 PR（base=`develop`，head=`sync/main-into-develop*`）把 `main` 的内容回灌 `develop`，恢复 develop ⊇ main；无漂移时**不开空合并 PR**（判断口径：`git log origin/develop..origin/main` 非空即需回灌）
  - **head 形态要对**：特性分支是特性分支、同步分支是同步分支；发布 PR 的 head 必须是 `develop` 本身（用 `sync/develop-into-main*` 之类的中间分支当 head 即为不合口径）
  - **热修复例外**：线上紧急修复可直提 `main`，但**必须回灌 `develop`**（走上面的反向同步）；否则漂移会在下一次发布时被 develop 侧覆盖掉
  - 合并用 **merge commit**（不 squash、不 rebase 合并），保持双分支合并记录可追溯
- **分支「已合并」判定以代码事实为准**：`git branch --merged` 只看提交拓扑、`git cherry` 看 patch-id——**两者对 squash 合并的 PR 都会误判**（squash 后 hash 与 patch-id 都变了，而内容其实已在目标分支）。清理分支前须双向核对：① 目标分支的合并记录（`git log <target> --grep="功能关键字"`）② 代码事实（功能是否真在目标分支里：`git show <target>:<file>` / `git grep`）
- 状态只更新 docs/plan/development-plan.md（里程碑粒度）+ 飞书需求池（条目粒度），不回填过程
- 每轮迭代完成后执行 CodeReview 四维度：① 规范性（命名/硬编码/常量分层）② 封装性（职责单一/边界/收敛重复）③ 架构合理性（依赖方向/无越层/无循环）④ 根因性（修复先定位根因所在层级——机制/惯例/架构，方案向行业规范与最佳实践看齐，选根因层级的**最小充分**解；禁止只消除当前症状的局部补丁——症状消失但病因留存 = 下次同因复发。多个候选方案时须对照评估取舍，不为回避改动而降级到贴片方案）；问题清零方可收尾；Review 发现的规范缺口回写本文件（事故驱动沉淀）
- 行为变更同步 docs 对应章节；架构定稿后按 project-init 第 6 步为各代码一级目录建专属 AGENTS/CLAUDE 上下文
