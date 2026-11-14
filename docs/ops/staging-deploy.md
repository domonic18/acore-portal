# 预发布环境自动部署手册(staging-deploy)

> 适用范围:**测试栈**(Mac Mini 常驻栈,公网入口 `dev.17aitech.com`)。
> 流水线作业名沿用同族惯例叫 `deploy-staging`;**部署对象仍是本仓的测试栈**
> (compose 项目名 `acore-portal-test`、env 文件 `.env.test`、数据目录 `workspace/mysql-test`)——
> 作业名统一的是**流水线侧的命名**,不是栈本身的身份。
> **生产栈不在本手册范围**——生产仍是人工发布,理由与将来自动化路径见
> [production-deploy.md §7](production-deploy.md)。生产自动化的待核对问题见
> [ci-deploy-pipeline-plan.md](../plan/ci-deploy-pipeline-plan.md)。

---

## 0. 一句话

`push → develop` 且**质量门禁 + 迁移守卫全绿** → 自托管 runner 在 Mac Mini 上重建测试栈 web 镜像并滚动；
**失败自动回滚镜像**；MySQL / Redis 数据卷原地复用,不动。

---

## 1. 触发与门禁

作业 `docker-release` / `deploy-staging` 定义在 `.github/workflows/ci.yml`,依赖链：

```
check ─┬─ build ─┬─ integration ─┬─ db-migration-guard ─┬─ docker-release ─┬─ deploy-staging
       │         │               │                       │                 │
       └─────────┴───────────────┴───────────────────────┴─────────────────┘
```

- **`push` 到 `develop` 且全绿才部署**；PR 与 `main` push 只跑门禁不部署
  (main 的 push 只构建 amd64 镜像,生产发布另需人工确认,见 `production-deploy.md` §7)。
- `docker-release` 产出镜像并推到 TCR(`ccr.ccs.tencentyun.com/lokta/acore-portal:<tag>`),
  `deploy-staging` 从 TCR 拉取该 tag 部署——**测试环境不再本地 build**
  (与生产同一条镜像通道,避免"测过的镜像≠发布的镜像")。
- tag = `develop-<提交短号>`,短 tag 不可变 ⇒ 回滚可精确到任一历史版本。
- 仓库变量 `DEPLOY_ROOT` 未配置时,整个作业**跳过**
  (不是排队等 runner)——未注册 runner 前流水线不会挂起。
- `develop` 分支的流水线**不打断**在跑的那次(`cancel-in-progress` 仅在非 develop 生效):
  中断会连带砍掉进行中的部署,留下半新半旧状态。新 push 排队接续即可。
- **架构**:测试栈在 Mac Mini(arm64)上原生跑 arm64 镜像——不做交叉模拟
  (Next.js 在 QEMU 下运行极慢,不值得为"同一架构"牺牲可用性)。

---

## 2. 前置:自托管 runner(人工,一次)

部署作业跑在**自托管 runner** 上(`runs-on: [self-hosted]`),因为它要操作本机的 docker 与栈目录。
命名沿用本机既有惯例:runner 名 `macmini-<仓库名>`、只用默认标签(`self-hosted` / `macOS` / `ARM64`),
每个仓库一份独立 runner 实例(目录 `~/Workspace/actions-runner/<仓库名>/`),故无需自定义标签来区分。

注册令牌必须**本人**在仓库 Settings → Actions → Runners 生成;命令形如:

```bash
mkdir -p ~/Workspace/actions-runner/acore-portal && cd ~/Workspace/actions-runner/acore-portal
# 下载 actions-runner(osx-arm64)并解压后:
./config.sh --url <本仓 URL> --token <注册令牌> --name macmini-acore-portal
./run.sh          # 建议注册为 launchd 常驻服务,保证开机自启
```

要求:runner 运行用户具备 docker 权限;`_work` 落在本地盘且空间够放镜像层。
**不传 `--labels` / `--no-default-labels`**:默认标签就是工作流里的 `self-hosted`。

> **坑:从别的 runner 目录拷贝安装包时,`bin` / `externals` 软链必须指向本目录内的副本**
> (`ln -sfn .../acore-portal/bin.2.338.2 bin`)。若软链仍指向别的仓的 runner 目录,
> `Runner.Listener` 会把根目录认成那个仓,报 `Cannot configure the runner because it is already configured`。
>
> **坑:runner 版本要对**——GitHub 拒收过期的 runner 包。拷贝本机在跑的那份安装目录,
> 别用旧的安装包;核验方式 `./bin/Runner.Listener --version`。

---

## 3. 仓库变量(Settings → Secrets and variables → Actions → Variables)

| 变量 | 含义 | 备注 |
| --- | --- | --- |
| `DEPLOY_ROOT` | 部署根目录 | 其下含 `.env.test` 与 `workspace/`;须填**绝对路径**,且与 CI 的代码检出**物理隔离** |

> 路径一律走仓库变量,**不写进 YAML**(本仓是公开仓,文档与工作流不得出现本机路径)。
> 变量缺失 → 作业跳过。测试栈不需要任何 secret(不连远端主机、不推镜像仓库);
> 将来生产自动化时沿用同族命名 `DEPLOY_HOST` / `DEPLOY_PATH` / `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`。
>
> **取值口径**:部署根取「工作副本」即可(本地这份仓库的绝对路径)——它已经同时含
> `.env.test` 与 `workspace/`,而 CI 的代码检出落在 runner 的 `_work/` 下,两者天然隔离,
> 不用搬迁任何数据。**注意**:公开仓的 Actions 变量对所有人可读,故该值会暴露维护者本机路径;
> 若不接受,改填一个不含仓库的专用目录(把 `.env.test` 与 `workspace/` 挪过去)即可,流水线无需改动。

---

## 4. 目录布局(硬约束:数据与密钥在 git 检出之外)

```
$DEPLOY_ROOT/               # 仓库变量 vars.DEPLOY_ROOT,绝对路径
├── .env.test               # web 服务 env(凭据,永不入 git)
└── workspace/              # 持久卷根
    ├── mysql-test/         # MySQL 数据目录(快照,不可再生)
    ├── redis-test/
    └── uploads/

代码检出:runner 工作目录 _work/<repo>/<repo>/portal   ← 与上面两者物理隔离
```

代码检出被 checkout 清理(`git clean`)也不会碰到数据与凭据。

`docker/docker-compose.test.yml` 的路径与镜像 tag 已参数化,默认值 = 本地开发原路径:

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `DEPLOY_ROOT` | `..`(本仓根) | 部署根;`.env.test` 与 `workspace/` 都从它下面取 |
| `WEB_IMAGE` | `acore-portal-test-web` | web 镜像 tag(部署时按 sha 打 tag,便于回滚) |

---

## 5. 部署流程

由 `scripts/deploy.sh --env staging --tag develop-<sha7>` 执行
(测试栈与生产栈**同源一份脚本**,避免两套流程漂移;旧的 `scripts/ops/deploy-staging.sh`
保留作手动兜底,CI 不再调用):

```
0) 预检:env 文件存在 / compose 可用 / tag 形态合法(main|develop)-<短号>
1) 钉镜像:WEB_IMAGE 写入 .env.test(回滚目标也落在这里,compose 靠它插值)
2) 拉镜像:docker pull ccr.ccs.tencentyun.com/lokta/acore-portal:<tag>(本地已有则跳过)
3) 迁移:docker compose --profile migrate run --rm migrate   (schema 先行)
4) 滚动:docker compose up -d --wait --no-deps --no-build web(只换 web,数据卷原地复用)
5) 健康检查:http://127.0.0.1:9000/api/status 须 200
6) 落状态:.deploy-state(status/tag/previous_tag/commit)
7) 镜像清理:同一仓库只留最近 3 个镜像(当前版本与回滚目标永不删)
```

**顺序不可反**:新镜像引入的 schema 变更靠第 3 步补上;漏跑则新代码读不到新列。

**失败即回滚**:第 3/4/5 步任一失败 → 把 `WEB_IMAGE` 退回上一版并重新起容器,
旧版本继续服务(数据库不回滚,迁移只向前)。

### 5.1 构建信息(页脚版本标识)

构建时注入两个构建期变量,固化进镜像产物,页脚据此显示版本行:

| 构建参数 | 取值 | 页面呈现 |
| --- | --- | --- |
| `BUILD_TIME` | `TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M'`(显式上海时区,不依赖 runner 本机时区) | `构建于 2026-11-08 10:52` |
| `APP_SHA` | `GITHUB_SHA` 前 7 位(与镜像 tag 同源) | `· e04370b` |

页脚最终呈现为单独一行:`构建于 2026-11-08 10:52 · e04370b`。

- 走 `NEXT_PUBLIC_*` **构建期内联**(`docker/web/Dockerfile` 里 `ARG` → `ENV` → `next build`):
  值与镜像绑定,不会出现「容器 env 与镜像产物说法不一致」。
- 缺省 `unknown` → 归一为空串 → **整行不渲染**(本地手工构建的情形)。
- 人工核对线上是不是最新版:看页脚那行的时间与短号,不必进容器查。
- **缓存坑**:本地 `pnpm build` 会复用 `.next/cache/webpack`,改了构建参数再构建**可能仍出旧值**
  (实测:换参数重建后产物里仍是上一次的短号)→ 改参数后先 `rm -rf .next/cache` 再构建。
  Docker 构建不受影响(`.dockerignore` 已排除 `.next/`,每次都是从零构建)。

---

## 6. 回滚

- 回滚 = **切回上一个镜像 tag**(秒级,不重新构建)。
- 脚本内置 ERR trap:第 4 步之后任一环节失败,自动用上一版镜像重建 web 容器,并在作业日志里写明回滚目标。
- **数据库不回滚**:迁移 forward-only,新迁移不改旧列语义,旧代码能跑在已迁移的 schema 上。
  迁移本身出问题时的处置:`prisma migrate resolve --rolled-back <迁移名>` + 手工修复
  (新迁移必须**可手工重放**——这正是迁移守卫静态检查的约束)。

---

## 7. 数据安全红线

- ❌ 不执行 `docker compose down -v` / 不删卷 / 不删 `$DEPLOY_ROOT`
- ❌ 不在部署根或卷根里做 `git clean -x`
- ❌ 不改 `scripts/dev/initdb` 的挂载(测试替身,生产栈禁有)
- ✅ web 容器必重建;其他服务**只在声明配置漂移时**被 compose 归位重建
  (例:redis 换成 digest 引用、soap-mock 服务改名——这类漂移是「手工起的栈」与「仓库里的
  compose 文件」之间的历史差,首次自动部署会一次性归位,之后不再发生)
- ✅ **数据卷原地复用,从不删除**:mysql / redis / uploads 都是 bind mount 到
  `$DEPLOY_ROOT/workspace/`;容器重建不动目录内容(实测重建后 5660 用户 / 1911 订单 /
  10369 积分流水、迁移账本 26 条全 finished 完好)
- ✅ `.env.test` 与卷根永不入 git

---

## 8. 迁移守卫(部署的前置闸门)

两个守卫作业在部署之前跑,**守卫不过 → 绝不部署**:

| 作业 | 断言 |
| --- | --- |
| `db-migration-guard` | ① 全部迁移从零重放成功 ② 二次重放零应用(幂等) ③ 库结构 = datamodel(无漂移) ④ 核心表齐备 ⑤ 新迁移 SQL 可手工重放(静态检查 + 运行时重放) |
| `db-incremental-guard` | ① `origin/main` 的迁移集(= 线上基线)增量到本分支 ② 本分支从零重放 ③ 两条路径结构完全一致且都无漂移 ④ 迁移集合一致 |

静态检查规则(MySQL 8.4 口径,MySQL 无 `CREATE INDEX IF NOT EXISTS` 这类 MariaDB 语法,
所以索引/列的守卫用 `information_schema` 判存)见 `scripts/ci/check-migration-idempotency.ts`。
历史迁移在 `scripts/ci/migration-idempotency-allowlist.txt` 里放行(立此检查之前已应用过,不追改);
新迁移必须通过,单条语句可用 `-- guard: <理由>` 注释豁免。

本地跑:`pnpm lint:migrations`。

---

## 9. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 作业一直排队 | 本仓的自托管 runner 未注册或离线 | 注册 runner(§2,名 `macmini-acore-portal`) |
| 作业秒跳 | 仓库变量未配置 | 配 `DEPLOY_ROOT` |
| 预检报「持久卷目录为空」 | `DEPLOY_ROOT` 指错 | 指向真实含 `workspace/mysql-test` 的目录 |
| 迁移守卫红:lint 报某条迁移 | 新迁移缺幂等守卫 | 按提示改写,或加 `-- guard: <理由>` 注释豁免 |
| 迁移守卫红:漂移 | 迁移 SQL 与 datamodel 不一致 | 重新生成迁移(`pnpm db:migrate`)并复核 diff |
| 部署失败已自动回滚 | 构建/迁移/健康检查任一环节 | 看作业日志定位;测试栈已回到上一版,业务不受影响 |
| 迁移报 `P1001: Can't reach database server at 127.0.0.1:3306` | migrate 容器拿到了回环地址——compose 插值优先级 **shell env > `--env-file` > `.env`**,CI 作业级 env 里的 `DATABASE_URL` 盖掉了 `.env.test` | compose 里 migrate **禁用 `${DATABASE_URL}` 插值**,改用与 web 同一个 `env_file` |
| `docker compose ps` 里 web 镜像显示成 `sha256:…` 摘要 | compose 记录的是解析后的镜像 ID;回滚锚点取的就是这个值 | 正常现象;`docker images` 里能看到对应的 `acore-portal-test:<sha7>` tag |
| 站点异常但流水线绿 | 手工改动过容器或数据 | 栈是常驻的,状态以 `docker compose -f docker/docker-compose.test.yml ps` 为准 |

---

## 10. 实跑验证(2026-11-08)

| 场景 | 结果 |
| --- | --- |
| `push develop` 首次自动部署 | 迁移步骤失败(`P1001`)→ 失败发生在 `switched=1` 之前,**web 未被触碰**,仍跑旧镜像且健康;数据完好 |
| 修复后 `push develop` 重跑 | 部署成功(2m42s);web 换成 `acore-portal-test:<sha7>`,`/api/status` 200;mysql 容器**未重建**;数据 5660 用户 / 1911 订单 / 10369 积分流水、账本 26/26 |
| `workflow_dispatch` 手动重跑 | 成功(1m3s);mysql / redis / soap-mock / mailpit **均未重建**,只有 web 重建 → 幂等 |
| 迁移守卫(两个作业) | 全绿,各约 50s |

> 首次部署时 redis / soap-mock 被重建一次:那是「手工起的栈」与「仓库里的 compose 文件」之间的
> 历史配置漂移(redis 用的 digest 引用、soap-mock 服务改名),**不是部署逻辑重建它们**。
> 之后配置一致,再部署不再重建。

---

## 11. 变更记录

| 日期 | 内容 |
| --- | --- |
| 2026-11-08 | 初稿:测试栈自动部署落地(迁移守卫 + 自托管 runner + 部署/回滚脚本 + 数据红线) |
| 2026-11-08 | 实跑验证后修订:compose 插值被 CI env 覆盖的坑与改法、容器重建的真实语义、幂等重跑实测 |
