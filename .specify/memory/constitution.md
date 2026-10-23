# acore-portal 项目宪法（Constitution）

## Core Principles

### I. 账号一致性三铁律（不可协商）

1. 站点用户名 = 游戏账号名：注册必须同步写入游戏 auth 库（单向 站点→游戏）；
2. 一切涉及密码/账号的变更必须双写（站点库 + 游戏 auth 库），任何单边写入均为事故级缺陷；
3. 商品 SKU `itemsend_{游戏物品ID}` 是商城与游戏世界的映射契约，SKU 结构变更必须走宪法修订流程。

理由：账号与 SKU 是站点与游戏世界互操作的根基，破坏任一条即造成游戏内资产与站点数据的永久性漂移。

### II. 发货必须可靠可见（不可协商）

支付成功 → 扣积分 → SOAP 发货 → 订单 completed，状态机必须闭环。SOAP 调用必须有超时 + 重试 + 失败落库；执行失败必须进重试队列 + 告警 + 提供人工补发入口；禁止任何静默失败、吞错、发货后无限期停留中间态。

理由：现状生产库 1,895 笔订单静默滞留 processing 是本项目的反面教材，同类问题在新系统出现视为回归事故。

### III. 积分账本可重算

积分余额必须可由流水重算推导；每笔流水必须实时更新余额（余额表仅为加速读取的缓存）；日终对账任务必须运行且差异可见、清零。

理由：积分即玩家资产，账实不符会直接摧毁"怀旧公益"社区的信任。

### IV. 兼容与无感迁移

存量 6,330 用户的 phpass（`$P$`）哈希登录必须透明升级：先校验 phpass，通过后立即重哈希为新算法，用户零感知。旧 URL（`?p=`/`?page_id=`/`/wp-login.php` 等）必须 301/302 到新路由，兼容层全覆盖——教程页截图与外部引用硬编码了旧路径。

验收锚点：M1 = 100 个老账号真实登录成功率 100%（无感）。

### V. 数据边界与生产只读

游戏四库（acore_auth/characters/world/eluna）schema 归 AzerothCore 管，禁止任何 DDL；本项目只读，auth 库仅按契约写账号表。业务库 schema 以 Prisma migrations 为唯一真相源，迁移 forward-only，合并后禁止修改。生产 101.42.117.123 正在运行：一切备份/分析访问只读；游戏库凭据仅存环境变量，不入库不入文档不入日志。旧仓库 `~/Code/acore-cms` 切换下线前勿动。

### VI. 安全纵深

永不信任外部输入：所有边界（表单/API/迁移脚本）必须经 schema 校验（Zod 或同级）。服务端必须强制校验：角色归属（防越权下单他人角色）、SKU↔游戏物品存在性、邀请码状态机。Turnstile 人机验证 + 登录限速是登录/注册的硬性要求。秘钥仅存 env；日志记事件不记敏感值；登录失败/限速/越权尝试必须记审计日志。

### VII. 单体优先 · YAGNI · 明确不做

6K 用户规模，单体优先；禁止未经论证引入微服务、新增中间件或依赖。`docs/requirement/01-requirement.md` 的「明确不做清单」（D6 物品寄他人角色、页面构建器、pmpro 订阅、解除密码同密、多语言）与「二期后置池」是硬边界——扩张必须先修订需求基准，禁止在 spec/plan/task 中夹带。

### VIII. 行为变更必有测试

每次行为变更必须附带对应测试；各里程碑验收锚点（development-plan.md）必须有自动化验证用例；提交前 `make check`（lint + typecheck + test）全绿；关键链路（注册→登录→下单→SOAP 发货→completed）必须有 E2E 覆盖。

## 附加约束与真相源

- **技术栈基线**：Next.js 全栈单体 / Prisma（业务库可写迁移、游戏三库只读、auth 可写）/ MySQL 8.4 + Redis 7 / node-soap / JWT HttpOnly + Redis 会话 / docker compose + caddy。当前为「规划基线」，`docs/arch/00` 定稿后升级为「结论」。
- **依赖方向（强制）**：`app → server → lib → constants`；禁止反向 import、循环依赖；客户端组件禁止 import `server/`（`server-only` 包强制）。
- **常量分层**：业务枚举（订单状态/积分流水类型/SKU 路由键/SOAP 命令名）一律进 `src/constants/`，禁止散落硬编码。
- **文档真相源**：`01-requirement.md` = 需求基准；`02-功能规格说明书.md` = 功能细节权威；`research/01` = 迁移映射与决策记录；`development-plan.md` = 里程碑状态；飞书需求池 = 条目级状态；`AGENTS.md` = 运行时开发规范。单一权威来源，禁止多份重叠文档。
- **状态更新**：只写 development-plan（里程碑粒度）+ 飞书需求池（条目粒度），不回填过程。

## 开发工作流与质量门禁

- **SDD 流程**：`/speckit-specify` →（可选 `/speckit-clarify`）→ `/speckit-plan` → `/speckit-tasks` →（可选 `/speckit-analyze`）→ `/speckit-implement`。spec 必须标注适用的宪法原则；implement 完成后逐条校验合规。
- **Git 纪律**：未经用户批准不 commit、不 push；多功能迭代按逻辑单元分批 commit，不打包巨型 commit；重推用 `--force-with-lease`。
- **CodeReview 三维度**：① 规范性（命名/硬编码/常量分层）② 封装性（职责单一/边界/收敛重复）③ 架构合理性（依赖方向/无越层/无循环）；问题清零方可收尾；Review 发现的规范缺口回写 AGENTS.md（事故驱动沉淀）。
- **行为变更同步文档**：同步 docs 对应章节与 AGENTS.md；架构定稿后按 project-init 第 6 步为各代码一级目录建专属 agent 上下文。

## Governance

- 本宪法效力最高：与 AGENTS.md 或其他文档冲突时，以本宪法为准；AGENTS.md 为运行时开发指引（GUIDANCE_FILE）。
- 修订流程：记录修订原因 + 语义化版本号（MAJOR = 原则删除/重定义；MINOR = 新增原则或章节；PATCH = 澄清与措辞）；涉及原则变更必须同步回写 AGENTS.md 对应章节。
- 所有 PR/Review 必须校验宪法合规；引入复杂度（新依赖/新抽象/新状态）必须在 plan 中论证理由。

**Version**: 1.0.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-10-23
