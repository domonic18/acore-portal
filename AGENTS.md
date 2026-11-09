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
| 终态架构方案 | docs/arch/00-总体架构设计.md |
| 生产发布 / 备份恢复 | docs/ops/production-deploy.md · docs/ops/backup-restore.md |
| 需求条目级状态流转 | 飞书需求池 https://my.feishu.cn/base/EPfDb63bPaBqQTsD5oBc6ztqnwh |

> **仓库是 public 仓**：文档不得出现其他内部项目名、本机路径、生产 IP、registry 命名空间（口径见记忆条目「公开仓文档脱敏口径」）。
> `specs/`（里程碑 SDD 过程产物）**不入 git**，只在本地工作区；交付形态与验收锚点以 `docs/plan/development-plan.md` 为准。

## 关键业务约束（违反视为事故级）

1. **三条铁律**：① 站点用户名 = 游戏账号名，注册同步写 acore_auth 库；② 一切密码/账号变更必须双写（站点 + 游戏 auth 库）；③ 商品 SKU `itemsend_{游戏物品ID}` 是商城与游戏世界的映射契约
2. **密码无感迁移**：存量 6,330 用户为**双格式混合**（phpass `$P$` 58% + WP6.8 `$wp$` bcrypt 42%，2026-10-23 实测）；登录按格式前缀分派校验，`$P$` 通过后重哈希为 `$wp$` bcrypt（一人一次零感知；`$wp$` 存量零接触）（权威口径见 research/01 §3 勘误注记；本地 `specs/001` research R1/R2 不入库）
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
make check                                     # 质量门禁: lint + typecheck + vitest(397 用例)
pnpm test:e2e                                  # Playwright E2E 关态档(151 场景, 含路由兼容 301/商城结账/商品增强(含列表快速编辑)/内容前台(含内容区底色/下载锚点/侧栏吸顶/快捷操作指南静态页+308)/侧栏快捷入口后台/渐进计划后台(含配图本地上传)/论坛管理(tab 双区+发帖回帖)/状态卡/工具页/通知/看板/SEO)
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

以上命令均已验证可用（M2 收口 2026-10-24 核对 package.json scripts 与 Makefile）。`db:deploy` 供生产/CI 用 `migrate deploy`。

测试环境（Mac Mini 常驻栈,公网 dev.17aitech.com → frpc → 宿主 9000）：

```bash
docker compose -f docker/docker-compose.test.yml up -d --build   # 起栈(mysql 3308/redis 6382 均只绑 127.0.0.1,web 0.0.0.0:9000)
cp .env.test.example .env.test                                   # 环境变量(gitignore 永不入库)
DATABASE_URL="mysql://acore_portal:acore_portal@127.0.0.1:3308/acore_portal" pnpm db:deploy   # 业务库迁移
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD acore_portal' < scripts/dev/initdb/init-system-config.sql   # 系统配置种子(宿主机默认值,容器内栈按文件尾注释 UPDATE;真实 SMTP 凭据不入库)
docker exec -i acore-portal-test-mysql-1 sh -c 'mysql -uroot -p$MYSQL_ROOT_PASSWORD' < scripts/migrate/wp-users-import.sql   # 存量用户导入(先 gzcat 备份 dump 导 wp_legacy 临时库,见 SQL 头注释)
```

生产环境（独立 compose，不含 mailpit/soap-mock/initdb；部署全流程见 docs/ops/production-deploy.md）：

```bash
cp .env.prod.example .env.prod                                                  # 引导级凭据(gitignore 永不入库)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build   # 起栈(仅 80/443 对外)
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml --profile migrate run --rm migrate   # 业务库迁移(容器网络内跑,DB 不发布端口)
TARGET_COMMIT=<发布提交> DEPLOY_ROOT=<检出根> bash scripts/ops/deploy-production.sh   # 发布(人工触发;含迁移台账断言与失败回滚,手册见 docs/ops/production-deploy.md §7.1)
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

**目录规范（2026-10-23 CodeReview 沉淀，借鉴内部同族项目）**:
1. **目录即架构**：新增一级/域目录须先修订本节（借鉴内部同族项目的《代码目录结构规范》守门做法）
2. **services 分域**：`services/` 根目录禁新增平文件，新域一律 `services/<域>/`（现有 auth/points/shop/orders/catalog/users-admin/images/account/content/progression/forum/status/media/home/notification/stats/settings/seo/sidebar/tools/site/security 均此模式）。跨域基础服务**只**入 `services/shared/`、不再单独占业务域目录，当前为审计 `audit`、发信队列 `mail-outbox`、用户 token `user-token`、积分账本 `ledger`、积分通知 `points-notify`、路由映射 `route-map`、游戏身份 `game-identity`、站点身份 `site-identity`、头像 `portrait`、审计去重 `audit-dedup`（借鉴内部同族项目按子域分包、根目录禁平文件）。**域间横向 import 由 eslint-plugin-boundaries 机械拦截**：域服务只能引用 `services/shared/*` 与 `eslint.config.mjs` 中 `ORCHESTRATION_EDGES` 登记的编排边，未登记直接 lint 失败（issue #6）
3. **app 层禁直连 prisma**：app/ 下 RSC 页面与 Route Handler（`src/app/api/**`）只做校验/会话/编排，数据组装一律收敛 service 层（页面私有取数函数放 `services/<域>/`）；`grep -rn 'from "@/lib/db"' src/app` 应为空
4. **components 准入**：`components/ui/` 只收 ≥2 个消费者的通用组件；页面私有组件与 page 同目录（colocation）；域组件入 `components/<域>/`；禁止另起 `app/_components/` 等第四类目录。展示组件保持无 IO——需要会话/库数据的异步壳放页面层（取数经 `services/<域>/` 的 view 函数，如 `getSidebarView`/`getArchiveView`/`getSiteHeaderView`），组件只接收 props
5. **业务域服务禁互引**：`services/auth` 与 `services/shop` 等域间不直接 import，经 `services/shared/` 或上层编排（防循环依赖，借鉴内部同族项目）
6. **配置分域收口**（宪法 v1.0.2）：env 仅存引导级凭据（业务库/Redis 连接串 + SESSION_SECRET），统一经 `lib/env.ts` 校验；游戏四库连接串与业务通道配置（SMTP/SOAP/app.url/腾讯云验证码/COS 等）存业务库 `system_config` 表，统一经 `lib/config.ts` 读取（启动预热 + 进程内缓存；游戏库 client 惰性建连，后台改连接串后经 `resetGameDbClients()` 重置缓存免重启；管理端改通道配置后调 `reloadSystemConfig`），禁止散点直读 `process.env`、禁止在新代码引入 env 版业务配置
7. **compose 三分**（2026-11-06 沉淀）：`docker/` 下 dev/test/prod 三套 compose 各自独立成文件，禁止跨环境复用服务定义。**生产栈（`docker-compose.prod.yml`）禁含测试替身**——`mailpit`（生产接真实 SMTP）、`soap-mock`（生产 `soap.url` 指真实 worldserver）、`scripts/dev/initdb` 挂载（含种子账号 `m1admin/adminpass123`）三者一律不进生产；生产 DB 不发布端口（迁移走 `--profile migrate` 一次性服务，备份走 `docker exec`）。新增测试用容器时同步在 prod 文件头部的「刻意排除清单」登记原因与替代方案
8. **启动钩子依赖图无 node-only 包**（2026-11-06 沉淀）：Next 14 会为 `src/instrumentation.ts` 额外编译一份 edge 产物，其传递依赖图内出现 `ioredis`/`mysql2`/`node:*` 等 node-only 包 → edge 编译报 `Can't resolve 'stream'`，**next dev 与 next build 双双失败**（2026-11-06 PR-0 曾因此静默炸掉整个 E2E，根因离报错点隔了三层 import）。因此：启动链可达的模块（`shared/audit.ts`、`shop/delivery.ts` 等）只许依赖 prisma，Redis 依赖另立文件（`shared/audit-dedup.ts`）。守卫：`tests/unit/instrumentation-graph.test.ts`（红测试，新增 node-only 依赖即失败）
9. **后台内链一律 `prefetch={false}`**（2026-11-08 沉淀）：后台页面是动态路由（会话/DB），Next 14 对它们的视口预取**只回约 120B 存根**（不含页面数据），且 hover 也不触发完整预取——即预取对点击零收益，只徒增每页 15~25 个请求（实测 `/admin` 36→11 个请求）。`src/app/admin/**` 与 `src/components/admin/**` 内的 `/admin*` 链接一律显式 `prefetch={false}`；指向站外公开页的链接（`/post/*`、`/forum/thread/*`）保留默认预取
10. **测试栈自动部署；生产栈仍人工**（2026-11-08 沉淀）：`push develop` 且门禁 + 迁移守卫全绿 → 自托管 runner（Mac Mini）执行 `scripts/ops/deploy-staging.sh` 重建 web 镜像并滚动；**生产栈不动**（理由见 `docs/ops/production-deploy.md` §7.2，手册见 `docs/ops/staging-deploy.md`）。七条硬约束：①**数据与密钥在 git 检出之外**——部署根走仓库变量 `DEPLOY_ROOT`（其下含 `.env.test` 与 `workspace/` 持久卷根），compose 的路径与镜像 tag 参数化，部署根不参与 checkout 清理；②**只重建 web**，禁止 `down -v` / 删卷 / `git clean -x`；其他服务只在**声明配置漂移**时被 compose 归位重建（如 redis 换 digest 引用、服务改名这类历史差），**数据卷一律 bind mount 原地复用、从不删除**；③**迁移 forward-only**，回滚只回镜像不回数据库；④**新迁移必须可手工重放**（MySQL DDL 非事务，中途失败要重放 SQL）——守卫 `scripts/ci/check-migration-idempotency.ts`（MySQL 口径：MySQL 无 `CREATE INDEX IF NOT EXISTS` 这类 MariaDB 语法，索引/列守卫走 `information_schema`）；⑤本机路径与主机名一律走 `vars.*`，不进 YAML（公开仓口径）；⑥**栈内服务用 `env_file` 取库连接串，禁 `${DATABASE_URL}` 插值**——compose 插值优先级 shell env > `--env-file` > `.env`，CI 作业级 env 里的 `DATABASE_URL`（CI 自己的 MySQL 服务容器）会盖掉 `.env.test`，插值出来的回环地址在容器网络内不可达（2026-11-08 首次自动部署即栽在这：migrate 报 `P1001`）；⑦**构建信息走构建期内联，禁运行期 env**——页脚版本行的构建时间与提交短号由 `deploy-staging.sh` 以 `--build-arg` 传入，`docker/web/Dockerfile` 里 `ARG` → `ENV NEXT_PUBLIC_*` → `next build` 固化进产物（常量口径见 `src/constants/version.ts`）；值与镜像绑定，不会出现「容器 env 与镜像产物说法不一致」；`NEXT_PUBLIC_*` **必须写字面量**（Next 只内联 `process.env.XXX` 的字面量，动态拼键不被替换）；⑧**生产发布脚本化、触发仍人工**——`scripts/ops/deploy-production.sh` 固化「校验发布提交 → 构建 → 迁移 → **迁移台账断言** → 健康检查 → 失败回滚镜像」，人登机器执行，**不接 CI**；脚本**不执行任何 git 变更**（只校验工作树 HEAD 已是目标提交且无未提交改动，拉代码由人做——发布脚本改仓库状态会破坏「回滚 = 回到上一个提交重新构建」这条人工回滚路径的前提）；台账断言口径：库内 `_prisma_migrations` 的已完成迁移数须等于仓库里的迁移目录数、且无未完成（失败残留）行，不符即中止发布
11. **GitHub 侧命名沿用本机既有惯例**（2026-11-08 沉淀）：仓库变量用 `DEPLOY_*` 族（`DEPLOY_ROOT` / `DEPLOY_HOST` / `DEPLOY_PATH`）、密钥用 `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`、服务级前缀用 `TCR_*` / `SCF_*` / `TENCENT_*`——**不加仓库前缀**；自托管 runner 名 `macmini-<仓库名>`、只用默认标签（`self-hosted` / `macOS` / `ARM64`），每仓一份独立 runner 实例，故工作流里写 `runs-on: [self-hosted]` 即可
12. **后台配置项的敏感口径与测试连接**（2026-11-08 沉淀）：① **敏感字段按「组+字段」登记**——`sensitiveMode(group, field)` 逐组声明，**禁回退到全局字段名集合**（新组里同名的 `password` 会被另一组规则误判）；两种模式：`secret`（只写不读，明文永不回显，空串=保持现值）与 `masked`（连接串回脱敏串，口令段以 `***` 占位）；② **取值解析唯一收口**——`settings/values.ts` 的 `resolveSubmittedValue`，保存与测试连接共用同一函数，禁止各自另写一套；③ **脱敏回显的坑**——提交串口令位仍是 `***` 时须用现值口令回填，否则只改 host 也会把 `***` 写进库；④ **测试连接用未保存的候选值**——SOAP/游戏库探测走候选参数（`rawExecuteCommand` 的 `conn` 覆盖、`probeGameDb` 临时 client），不落库即可验证，不允许「先落库再验证」留下半改状态；⑤ **审计只落通道名与成败**——任何连接参数与口令不入日志；⑥ **游戏库热重置的在途请求取舍**：重置会断开在途请求，属已知取舍，改动前在文档写明
13. **外部通道的后台化口径（对象存储 / 工具站 / 备份）**（2026-11-08 沉淀）：① **COS 以桶名为开关**——`cos.bucket` 留空=整组不生效（`config.cos` 为 `undefined`），填了桶名即启用，此时 `region/secretId/secretKey/cdnBase` 须齐全，缺项报 `VALIDATION_FAILED` 且**零写入**；桶名留空时其余项照旧留存，便于日后重新启用而不必重填密钥；② **密钥只写不读**——`cos.secretKey` 按规则 12 的 `secret` 模式登记，视图只回「已配置」不回明文，留空提交=保持现值；`secretId` 不是密钥，允许回显（便于识别用的是哪把密钥）；③ **缓存实例内含旧凭据，须随配置重置**——COS SDK 实例构造时即固化凭据，改配置后不丢弃缓存实例则换密钥不生效（`resetCosClient()`）；游戏库四个 Prisma client 同理（`resetGameDbClients()`），二者都是「改完免重启」的必要条件；④ **外部站点地址只存配置、不改代码**——rank 排行榜子站与 DKP 独立站的地址存 `system_config`（`tools.rankBase` / `tools.dkpUrl`），换环境只改后台，不重构建镜像；⑤ **测试连接只用只读探针**——COS 走 `headBucket`（读操作，无副作用无费用），禁止用写/删操作探活；⑥ **备份策略参数即 cron 的运行契约**——`backup.retentionDays` / `backup.gameWeekly` 由备份脚本每次运行读取，改这两项等价于改下次备份行为，故表单留空=保持现值（0 保留期在脚本里表示「只留当日」，不是「未设置」）
14. **商品 SKU 契约的交叉校验（发货只看 SKU，不看 `game_item_id`）**（2026-11-08 沉淀）：① **SKU 是发货的唯一依据**——`itemsend_{id}` / `transmog-item_{id}` 由 SKU 解析物品 ID，`game_item_id` 只是元数据 ⇒ 两者不一致 = **静默发错物品**；② **SKU 由所选物品单向派生**（物品 → SKU），界面默认只读，手改只走「高级区」且服务端仍须复核——禁止让 SKU 与物品 ID 同时可手写；③ **服务端是最终闸门**——保存前跑 `validateSkuBinding`（纯函数，`src/constants/shop-sku.ts`）：物品类校验「SKU 解析出的物品 == 所选物品」，服务类校验「SKU 命中处理器注册表」；违规一律 422 且带 `field`（sku / gameItemId），不得静默放行；④ **游戏库不可达即 503 不放行**（`GameDbError`），不得在物品未经校验的情况下保存商品；⑤ **服务类副本键放行**——`-copy` / `-copy-N` 派生键可编辑（副本为何仍能发货见规则 16）；⑥ **物品检索只读 world.item_template 的 entry/name/quality/stackable 四列**，不擅自加列（生产 AC 真表列名未验证，加错会炸生产读取；`stackable` 已核对为 `int default 1`）；**中文名另取 `world.item_template_locale`**（生产 AC 真表已核对：主键 `(ID, locale)`、`Name text`，zhCN 即中文名；该表在精简游戏库可能不存在 ⇒ 服务层按「无本地化数据」降级为只显示英文名，不阻断检索、不报 503）；⑦ **存量不合规商品只体检不自动改**——`scripts/ops/audit-product-sku.sql` 是只读清单，由运营在后台逐个修
15. **后台商品编辑页的交互基线**（2026-11-08 沉淀）：① **两栏编辑台**——主列分组卡片（基本信息 / 价格与库存 / 售卖窗口 / 展示与排序 / 详情）+ 右栏商品图片面板与商城预览；② **图片面板**——右栏大图可点即替换主图，缩略图条支持设为主图 / 上移 / 下移 / 移除，首图=主图；③ **字段级校验**——错误落到具体字段旁（红字 + `role="alert"`），提交被拦时给出汇总提示；④ **吸底保存条**——整页**有且仅有一个**可访问名含「保存」的按钮（Playwright strict mode 约束），保存态文案（保存中 / 已保存 / 出错）用非按钮元素承载；⑤ **未保存提示**——有改动即显示提示条，`beforeunload` 拦刷新/关闭（App Router 无路由级拦截，站内跳转靠提示条，勿假装有）；⑥ **服务类不提供自由文本 SKU**——SKU 只是商品唯一标识，界面由处理器下拉自动派生（发货依据见规则 16）
16. **服务类的发货依据独立于 SKU 落列（`-copy` 副本整改）**（2026-11-08 沉淀）：① **SKU 只是唯一标识**——服务类商品的发货依据是 `product.handler_key`（发货处理器键），下单时快照到 `order_item.handler_key`；此前 SKU 既当标识又当处理器键，复制商品只能追加 `-copy` 后缀 ⇒ 副本命中不了处理器注册表 ⇒ **每个副本必然发不出货**（复制功能仅服务类可用，即副本 100% 坏）；② **整改方向是改数据模型，不是打补丁**——`-copy` 派生 SKU 照常存在（唯一性需要），但不再影响发货；③ **存量兼容**——迁移按 SKU 反查注册表回填 `handler_key`，缺省时回落「SKU 本身即注册键」的旧形态；④ **复制时处理器键随源商品继承**（副本与源商品发货行为一致）；⑤ **物品类不变**——`itemsend_{id}` / `transmog-item_{id}` 的发货依据仍是 SKU 本身（规则 14）
17. **服务类限购语义：单次 1 件 + 发货完成后释放额度**（2026-11-08 沉淀）：① 服务类是一次性服务（改名 / 转种族 / 解锁名字），**单次购买恒限购 1 件**（加购 qty>1 即拦），后台表单对服务类锁定「每人限购 = 1」；② **额度在发货完成后释放**——用户改了名字下了单，改完还想再改一次应当允许（订单态 `completed` 释放；在途 `paid` 仍占用）；③ **三处口径一致**——加购 / 改数（软拦截）+ 结账事务内（强制关，失败零写入回滚）
18. **可堆叠物品的 SKU 契约（买多个 = 一封邮件堆叠）**（2026-11-08 沉淀）：① `world.item_template.stackable`（AC 真表 `int default 1`，1 = 不可堆叠，>1 = 可堆叠）决定发送形态——`_stack` 后缀 = **一封邮件发 qty 个**（发货层早已支持），无后缀 = qty 封各 1 个（AC `Item::CreateItem` 超 maxStackSize 会静默钳制）；② **选物品即派生**——选择器读到 `stackable > 1` 时自动勾选「一封邮件发多个」并派生 `itemsend_{id}_stack`；③ **保存期强制**——可堆叠物品缺 `_stack` 一律 422 `SKU_STACK_REQUIRED`，把「买多个被发成多封邮件」的口径前移到保存期；④ 只读 world 表，不加列不改 schema
19. **运营告警通道：飞书自定义机器人 webhook**（2026-11-08 沉淀）：① **失败必须让人看见**——发货落到 `delivery_failed` 即推飞书卡片（非阻塞，不阻断发货主流程），落实「失败进重试队列 + 告警 + 人工补发，禁止静默」；② **只报首次**——人工重试再失败不重复打扰（按订单态跃迁判定，不按尝试次数）；③ **通道配置进后台**——webhook 地址与签名密钥存 `system_config` 的 `notify` 组，密钥按规则 12 的 `secret` 模式只写不读，并带独立启用开关；④ **边缘安全**——签名用 Web Crypto（`crypto.subtle` + `btoa`），**禁 `node:crypto`**（启动链可达模块禁 node-only 依赖，规则 8）；⑤ **2xx 不等于成功**——飞书业务拒绝码（如 19021 签名不符）按失败处理，瞬时错误（5xx / 网络）重试一次
20. **后台表格的窄屏排版口径**（2026-11-08 沉淀，issue #48）：① **窄屏靠横滚，不靠折行**——后台表格统一用共享组件 `components/ui/table.tsx`（外壳 `overflow-x-auto` + 表体 `min-w-[680px]`），表头 `Th` 一律 `whitespace-nowrap`；禁止为「塞进一屏」而允许中文逐字竖排（表格基本不可读）；② **单元格按内容定折行策略**——日期/时间/金额/ID/状态等不可拆分的值加 `whitespace-nowrap`；长文本（商品名、备注）用 `truncate` 或保留折行但**不逐字断**（`min-w-0` + 换行点由文案自己控制）；③ **新表格不另起炉灶**——用 `Table/THead/Th/Tr/Td` 组件，不手写 `<table>`/`<th>`（手写就会漏掉表头不折行这条）；④ **操作区在窄屏要能排下**——批量按钮等一排动作在窄屏用两列网格（`grid-cols-2 sm:flex`），不靠 `flex-wrap` 挤出参差的一行
21. **商品 FAQ（常见问题）的口径**（2026-11-08 沉淀，issue #159）：① **按商品维度，不做全站 FAQ**——`product_faq` 挂 `product_id`（`ON DELETE CASCADE`），前台按 `sort` 升序取；② **排序是数据不是数组序**——`sort` 字段落库，重排按传入 id 顺序**重写 sort**（不是交换两值），保证与前台读序、服务端列表序三处一致；重排**必须覆盖该商品全部问答**（只传子集会让子集 sort 与未传行撞值、顺序被静默打乱，一律拒）；③ **审计只记 id**——`product_faq_saved` / `product_faq_deleted` 的 payload 只带 `productId` / `faqId`，**问答正文不入审计日志**（沿用 T048 脱敏口径）；④ **归属校验不可省**——改删时用「productId + faqId」双条件命中，跨商品访问一律 NOT_FOUND（不因知道 id 就放行）；⑤ **管理界面独立成页**——`/admin/products/[id]/faq`，不塞进商品编辑表单（避免触发「整页唯一『保存』按钮」的 E2E strict mode 约束）；⑥ **行内草稿按行独立**——每行自持 question/answer 草稿与保存态，失败不丢草稿；行 `key` 只用稳定 id（**不要把内容拼进 key**——保存后 refresh 会改 key 导致整行重挂载、「已保存」提示被冲掉）；⑦ **迁移写法**——MySQL 无 `CREATE INDEX IF NOT EXISTS`，索引与外键**内联在建表语句**里，让 `CREATE TABLE IF NOT EXISTS` 命中时整句跳过，兼顾幂等重放与 `migrate diff` 无漂移
22. **前台用户侧编辑器口径**（2026-11-09 沉淀，论坛编辑器升级）：① **面向普通用户的编辑器一律 Vditor IR**（`mode:'ir'`，Typora 式即时渲染），代码层存纯 Markdown；后台管理员编辑器维持 @uiw/react-md-editor 不变（两套并存，禁互相迁移）；② **运行时资产必须自托管**——实例配 `cdn:'/vditor'`，资产经 `scripts/build/copy-vditor-assets.mjs`（挂在 `dev`/`build` 脚本链首，白名单拷贝到 `public/vditor/`，gitignore 不入库）加载，**禁 unpkg 等外部 CDN**（国内不可达）；**资产拷贝禁入 `postinstall`**——postinstall 在 Docker「manifest 先行分层安装」层里没有源码文件可用必炸（2026-11-09 部署事故），且行业惯例 postinstall 只动 `node_modules`、不向源码树写产物；③ **颜色只用受限色板类标记**——Markdown 无颜色语法，统一 `<span class="c-x">` 类标记；新增颜色 = `src/constants/forum-palette.ts` 常量 + `lib/markdown.ts` sanitize 类名白名单 + `globals.css` 双作用域样式**三处同步改**，`style` 属性始终全局剥离（XSS 真闸门在服务端 rehype-sanitize，编辑区关闭 Lute sanitize 只为色板标记渲染）；**编辑区实时着色须 retag 预览层**（2026-11-09 用户反馈）——IR 模式把内联 HTML 渲染成隐藏标记节点（`span[data-type=html-inline]` 内 `code.vditor-ir__marker`），正文是夹在开/闭标记间的裸文本节点，CSS 无法命中 ⇒ 上色后编辑区视觉零变化；解法是在 `input`/`after` 回调里（`processAfterRender` 块重渲染后 DOM 已终态）把「开标记..闭标记」整段包进 `<span class="c-x" data-palette>`，Lute 序列化（VditorIRDOM2Md）只读标记节点文本、对包裹层零感知（往返无损已实测）；**已知上游怪癖（非本层回归，已对照实证）**：光标落在隐藏标记附近时 End 键定位与 undo 表现异常（鼠标点击定位正常），系 vditor 对隐藏标记的光标归一化问题，勿误归因到 retag；④ **图片上传统一走 `/api/forum/upload` handler**——工具栏/粘贴/拖拽同路（`upload.handler` 接管返回 null）；⑤ **React 集成坑**——StrictMode 双挂载必须**每挂载周期独立子节点** + `after` 回调身份闸门（vditor `destroy()` 会清空挂载元素 innerHTML，共享挂载点会互相抹掉；未就绪实例不能调用任何实例方法）；自定义工具栏项必须**自定义 click**（IR 的 `processToolbar` 只认固定命令名，prefix/suffix 在 IR 落空；click 的 vditor 参数是内部对象无原型方法，须经组件 ref 拿公共实例后 `insertMD`）；⑥ **E2E 口径**——填编辑器必须 `keyboard.insertText`（`fill()` 的 execCommand 路径与 vditor 内部态失同步，后续工具栏操作会静默失效）；单次 insertText 不触发 vditor 块内重渲染（上游行为），须补一次按键触发再 Backspace 撤销；vditor 工具栏 aria 名（如「删除线 <⌘D>」）与业务按钮（「删除」）在 `getByRole` 子串匹配下冲突，按钮定位须 `exact: true`；上传项是 `div[data-type="upload"]` 内嵌 input（非 button），文件派发直接对 `input[type=file]`；⑦ **窄屏工具栏口径**（2026-11-09 用户反馈「工具栏 8 行占满编辑区」）——vditor 工具栏无内建响应式折叠，17 个按钮按块级自然换行 ⇒ CSS（≤640px）改 **flex 单行横滑**（微信/知乎等移动端编辑器行业惯例）：`flex-wrap:nowrap + overflow-x:auto`、隐藏分隔符、字数 counter sticky 贴右，末位按钮截断即「可滑」视觉提示；**弹层（`.vditor-hint`，色板/标题下拉）在横滑容器内必被 overflow 裁剪**（一轴 auto 另一轴 visible 计算值也是 auto），且按事件钩落位不可行——vditor 自身 click 处理会 `stopPropagation`（祖先层气泡监听收不到）、开面板路径存在异步（capture+microtask 时序不稳，实测有选区/无选区走不同路径）⇒ 窄屏弹层改 `position:fixed`（配 `width:max-content` 防 fixed 后可用宽=视口-left 导致菜单行宽随定位漂移；箭头伪元素随默认定位设计，重定位后不再指向按钮，隐藏），坐标由组件 **MutationObserver 盯弹层 style 翻转**落位（display 变 block 的瞬间，观察回调在绘制前的微任务点运行，零闪烁、与 vditor 内部时序解耦；写回同值守卫防观察自触发），落位到工具栏下方并按视口夹紧；**横滑即收起**（fixed 弹层不随滚动项移动，留着只会悬空）；桌面端（>640px）走 vditor 默认绝对定位零改动（观察回调里 matchMedia 分支顺带清 stale inline 坐标）

## Code style

- **通用**: KISS / YAGNI / DRY；SOLID 相关时应用；优先行业标准库而非自定义实现；现代框架特性优先
- **文件组织**: 小而专注、单一职责；单文件 ≤350 行，超限即拆；工具/常量/类型/组件/业务逻辑分离；组合优先于继承
- **命名约定**:

| 对象 | 约定 | 示例 |
| --- | --- | --- |
| 文件/目录（含组件文件） | kebab-case | `item-restore.ts` `product-card.tsx` `soap-client/` |
| React 组件标识符（导出名） | PascalCase | `export function ProductCard`（文件仍为 `product-card.tsx`） |
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
- 腾讯云验证码（TCaptcha）人机验证 + 登录限速为登录/注册硬性要求（2026-11-07 由 Cloudflare Turnstile 替换：国内用户可达性，且两端依赖同一海外端点会让第三方抖动等于全站锁在登录门外）

## Testing

- 定稿基线：Vitest（单元/集成）+ Playwright（关键链路 E2E：注册→登录→下单→发货）
- 每次行为变更必须附带测试；M1-M4 各里程碑验收锚点（development-plan.md）必须有对应自动化验证用例
- 提交前：`make check` 全绿

## Git & workflow

- 未经用户批准不 commit、不 push；多功能迭代按逻辑单元分批 commit，不打包巨型 commit；重推用 `--force-with-lease`
- 状态只更新 docs/plan/development-plan.md（里程碑粒度）+ 飞书需求池（条目粒度），不回填过程
- 每轮迭代完成后执行 CodeReview 四维度：① 规范性（命名/硬编码/常量分层）② 封装性（职责单一/边界/收敛重复）③ 架构合理性（依赖方向/无越层/无循环）④ 根因性（修复先定位根因所在层级——机制/惯例/架构，方案向行业规范与最佳实践看齐，选根因层级的**最小充分**解；禁止只消除当前症状的局部补丁——症状消失但病因留存 = 下次同因复发。多个候选方案时须对照评估取舍，不为回避改动而降级到贴片方案）；问题清零方可收尾；Review 发现的规范缺口回写本文件（事故驱动沉淀）
- 行为变更同步 docs 对应章节；架构定稿后按 project-init 第 6 步为各代码一级目录建专属 AGENTS/CLAUDE 上下文
