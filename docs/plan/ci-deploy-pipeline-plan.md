# acore-portal CI 流水线发布方案（待核对 · 未实施）

> **状态：方案告知稿，2026-11-07 写就。尚未实施，任何代码/配置改动都还没做。**
> 本文只描述方案、约束与待决问题，供后续方案核对使用；核对通过并拿到明确指示后才动手。
> **演练场是另一个内部项目，不在本仓库**——先在那边把方案跑通、验证过，再决定是否照搬到 acore-portal。

> **2026-11-08 补记**：本文的「未实施」指的是**生产栈**自动发布——生产仍按人工发布执行（理由见 `docs/ops/production-deploy.md` §7.2），§4 的待决问题依旧开放。
> 与此同时**测试栈已先行自动化**（`push develop` → 自托管 runner 重建测试栈 web 镜像 + 迁移守卫闸门 + 失败自动回滚），
> 手册见 [../ops/staging-deploy.md](../ops/staging-deploy.md)。两者形态不同，本文 §4 的问题仍需逐条给结论。

---

## 0. 给读者的说明

- 你大概率是来做**方案核对**的 agent/工程师。请按 §4 的问题逐条给结论，而不是直接开始实现。
- 本文引用的行号与文件名在 2026-11-07 的 `main`（`a6516cd`）上核对过；实现前请以仓库现状为准。
- 门户与子站 `acore-ranking` 是**两个仓库、两套部署形态**，不要互相套用（详见 `docs/ops/production-deploy.md` §7）。

---

## 1. 现状

### 1.1 现有流水线（只做检查与构建，不发布）

`.github/workflows/`：

| workflow | 触发 | 作业 | 作用 |
| --- | --- | --- | --- |
| `ci.yml` | push / PR | `check` | lint + typecheck + vitest（`make check` 的等价物） |
| | | `build` | `next build`（含 edge 产物编译） |
| | | `integration` | 自举游戏四库 + 业务库迁移 + SOAP mock，跑集成测试 |
| `e2e.yml` | push / PR | `e2e (off, 0)` | Playwright 关态档 |
| | | `e2e (on, 1)` | Playwright 开态档（`E2E_CAPTCHA=1`） |

**没有 deploy job。** 这是有意的，不是遗漏——理由与后续建议路径写在 `docs/ops/production-deploy.md` §7.2。

### 1.2 生产形态

腾讯云 **CVM + Docker Compose**，独立于 dev/test 三套 compose：

- `docker/docker-compose.prod.yml`：mysql / redis / web / caddy（+ 一次性 `migrate` profile）
- 生产 DB **不发布端口**（外部流量只走 caddy；迁移走容器网络内的一次性服务；备份走 `docker exec`）
- 生产栈**不含任何测试替身**（mailpit / soap-mock / initdb 一律不进生产）
- 引导级凭据在宿主机 `.env.prod`（不入库）；业务通道配置存业务库 `system_config` 表（宪法 v1.0.2）

现行**人工**发布动作（`docs/ops/production-deploy.md` §7.1）：

```bash
cd /home/ubuntu/acore-portal
git fetch --all && git checkout <发布提交>
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml --profile migrate run --rm migrate
```

**顺序不可反**：新镜像引入的 schema 变更，靠最后那条一次性 `migrate` 服务补上；漏跑则新代码读不到新列。

### 1.3 决定方案形状的硬约束

1. **运行配置不在代码里**：引导级凭据（业务库/Redis 连接串、`SESSION_SECRET`）在宿主机 `.env.prod`；游戏四库连接串与业务通道配置（SMTP / SOAP / 腾讯云验证码 / COS 等）在库内 `system_config`。发布过程**不得**把这些打进镜像、覆盖或打印。
2. **迁移 forward-only**：Prisma 迁移合并后禁止修改，破坏性变更走 expand-contract 分批。流水线**不能**自动 `down`；代码回退 ≠ 数据回退。
3. **门户尚未上线**：生产域名目前仍指向旧 WordPress 栈，门户生产栈没有真实流量。这也意味着"自动发布"目前缺少可观测的真实后果。
4. **回滚必须能人工兜底**：Compose 发布没有版本化制品仓，回滚 = 回到上一个提交重新构建。
5. **依赖方向不因流水线改动而放宽**：`app → server → lib → constants`、`components → lib`；`components/` 禁直连数据库；客户端组件禁 import `server/`。

---

## 2. 目标形态

一句话：**把"发布"从人工动作变成流水线的一个作业，同时保留人工闸门与人工兜底。**

拟议流水线骨架：

```
push / PR
    └─ check ─ build ─ integration ─ e2e(off) ─ e2e(on)      ← 已有，不动

push main（或 tag / 手动触发，取决于 §4.3 的结论）
    └─ deploy-production
         1. 取发布物（构建产物或镜像）
         2. 送到生产主机
         3. 重建/切换 + 跑一次性 migrate
         4. 健康检查（判据见 §4.6）
         5. 失败 → 回退到上一个已知良好版本（回退策略见 §4.7）
```

闸门与留痕：

- GitHub **Environment `production`** + required reviewer（人工放行）；
- `main` 分支保护，合并即触发但受闸门约束；
- 每次发布写 artifact（发布提交号、镜像 tag/digest、耗时、健康检查结果、回退与否），便于事后追溯。

### 2.1 两个候选形态——需要在演练中验证取舍

| 维度 | **A. 源码构建**（现状延续） | **B. 镜像交付**（内部演练项目现状延续） |
| --- | --- | --- |
| 发布物 | 服务器上 `git checkout` + `docker compose build` | CI 推 TCR 镜像，服务器只 `pull` + `up -d` |
| 生产主机要求 | 需装 git / docker / buildx，基础镜像拉取依赖国内镜像源 | 只需 docker（拉镜像） |
| 发布耗时 | 主机上完整构建，分钟级且随机器性能波动 | 拉镜像，秒级到几十秒 |
| 回滚 | 回上一个提交重新构建（慢，且重建可能失败） | 切回上一个镜像 tag（快，产物确定） |
| 与内部演练项目一致性 | 否 | 是 |
| 新增复杂度 | 低 | 需 registry 命名空间/凭据管理；CI 里要处理镜像 tag 注入 |

**为什么先在内部演练项目演练**：那边的 CI 已经在做"构建镜像 → 推 TCR"（四个镜像构建推送作业，develop/main push 触发，self-hosted runner），生产 compose 已经是"按 `APP_TAG` 拉 TCR 镜像"的形态——**唯独缺的就是"把镜像送到生产并切过去"这一段**。这正是门户将来要补的那一段。先在那边把这段跑通、踩坑、留模板，再决定门户照搬 A 还是 B。

---

## 3. 演练计划（发生在内部演练项目侧，本仓库不动）

### 3.1 已核实的内部演练项目前提

- 生产 = 轻量服务器 + `docker-compose.prod.yml`，服务镜像来自自有 TCR 命名空间（`web` 等四个服务），版本由服务器 env 的 `APP_TAG` 决定（compose 内形如 `image: .../web:${APP_TAG:-latest}`）。
- CI 已有四个镜像构建推送作业（develop/main push 触发，self-hosted runner），**同样没有 deploy 作业**。

### 3.2 演练要做的事

1. 在内部演练项目上加一个 deploy 作业：`main` push → 连接生产主机 → 设定 `APP_TAG` → `docker compose pull && up -d` → 健康检查 → 失败则切回上一个 tag。
2. 逐项记录实测结论：每步耗时、凭据怎么放、SSH 是否需要跳板/是否要装在生产机上的自托管 runner、compose 重建期间是否断流、数据库迁移与切流量的先后。
3. 产出一份**可复用模板**（作业 YAML 骨架 + 服务器侧脚本 + 回退步骤 + 踩坑清单），作为门户方案的输入。

### 3.3 演练明确不做

- 不动内部演练项目的业务逻辑；
- 不改生产数据、不执行不可回滚的迁移；
- 不在演练中触碰 acore-portal 的任何流水线文件。

---

## 4. 待核对问题（请逐条给结论）

| # | 问题 | 我的倾向（供参考，非结论） |
| --- | --- | --- |
| 1 | 门户最终走 A（源码构建）还是 B（镜像交付）？若走 B，TCR 命名空间与凭据归谁管？ | 倾向 B：回滚快、产物确定、与演练一致 |
| 2 | 发布触发点：`main` push / tag / 手动 `workflow_dispatch`？ | 倾向 tag 或手动——避免"合并即上线" |
| 3 | 闸门形态：GitHub Environment 审批 / 服务器上人工执行 / 两者都要？ | 倾向 Environment 审批（留痕在 GitHub 侧） |
| 4 | 凭据形态：SSH 私钥进 GitHub Secrets，还是在生产机上装 self-hosted runner？ | 倾向前者简单、后者不引私钥但把 runner 装在生产机上（另一种攻击面）；需演练验证 |
| 5 | 迁移与部署的先后与失败处理：migrate 失败要不要自动回退镜像？数据侧破坏性变更的人工边界在哪？ | 迁移失败**不自动回退**（forward-only 下代码回退救不了数据），改为失败即停并告警、人工介入 |
| 6 | 健康检查判据：哪些接口算"发布成功"？失败阈值与观察窗口多长？ | 待定：至少 `/api/status` + 首页 + 登录页可达 |
| 7 | 回滚：镜像形态下"切上一个 tag"够不够？数据侧破坏性变更怎么兜底？ | 镜像切换够用；数据侧靠 expand-contract 提前做，不靠流水线 |
| 8 | 门户未上线期间，是否先保持人工发布、待真实流量后再开自动化？ | 倾向是——未上线时自动化的收益低于风险 |
| 9 | 演练的验收标准：内部演练项目侧满足什么条件才算"通过"，可以开始动门户？ | 待定，建议：至少一次成功发布 + 一次成功回退 + 踩坑清单成文 |

---

## 5. 风险与红线

- **门户红线**：生产主机当前跑的是旧 WordPress 栈，切流前对生产一切只读；演练期间不得产生任何指向生产的写操作。
- **凭据纪律**：`.env.prod` / `system_config` 里的凭据禁止写进镜像、job 输出与日志。历史上已踩过的坑：GitHub 会以"可能含密"为由**丢弃**含密值的 job 输出（`Skip output '...' since it may contain secret`），下游拿到的会是空串——需要跨作业传递的值只能是"非密片段"（如 tag、digest），完整地址在作业内用 secret 现场组装。
- **不自动 down 迁移**，不在流水线里做不可回滚的数据变更。
- **不放宽依赖方向约束**：`app → server → lib → constants`、`components → lib`，流水线改动不得成为绕过宪法条款的后门。
- **发布与回滚同源**：若最终引入脚本，发布与回滚必须调用同一份脚本/同一组命令，避免两套流程漂移。

---

## 6. 相关文档与参考实现

| 文档 | 用途 |
| --- | --- |
| `docs/ops/production-deploy.md` | 生产栈与发布手册；§7 已记门户"人工发布"的现状与理由 |
| `docs/ops/backup-restore.md` | 备份/恢复口径（发布前后需与备份窗口对齐） |
| `docs/plan/development-plan.md` | 里程碑状态真相源（状态只在此更新） |
| 宪法 v1.0.2（`AGENTS.md` §目录规范 6/7） | env 与 `system_config` 分域、生产栈禁测试替身 |
| 子站 `acore-ranking` 的 `docs/arch/04部署架构.md` | **另一种发布形态**（SCF 容器镜像函数）的完整实践：分支→命名空间映射、只换镜像不动配置、摘要锁定镜像、已踩的坑清单。可作为"发布形态该怎么收敛"的参考 |

---

## 7. 变更记录

| 日期 | 内容 |
| --- | --- |
| 2026-11-07 | 初稿：写就当时的现状、目标形态、内部项目演练计划与待核对问题。未实施任何改动。 |
