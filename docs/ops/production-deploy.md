# 生产部署手册(production-deploy)

> 生产栈 = `docker/docker-compose.prod.yml`,与 dev/test 完全分离的独立 compose。
> 本文是「换台机器快速起站」的操作序列;部署资产(caddy 配置、compose、env 模板)全部入库。

## 0. 生产栈与测试栈的边界

| | dev | test | prod |
| --- | --- | --- | --- |
| compose | `docker-compose.dev.yml` | `docker-compose.test.yml` | `docker-compose.prod.yml` |
| 服务 | mysql / redis / mailpit / soap-mock | mysql / redis / mailpit / soap-mock / web | mysql / redis / web / caddy(+ 一次性 migrate) |
| 对外端口 | 3307 / 6381 / 8025 / 1025 / 17878 | 3308 / 6382 / 8026 / 9000 | 80 / 443(仅 caddy);web 另开 127.0.0.1:3000 排查口 |
| 种子账号 | `scripts/dev/initdb` 灌 `m1admin/adminpass123` | 同左 | **不挂 initdb**,账号走真实注册 |

**测试专用容器一律不进生产**:

- `mailpit` → 生产接真实 SMTP(`system_config` 的 `smtp.*`,后台「设置」改)
- `soap-mock` → 生产 `soap.url` 指向真实 worldserver 的 SOAP 端点
- `scripts/dev/initdb` → 生产不挂载;业务库结构由 `prisma migrate deploy` 建

## 1. 首次部署(空机器起站)

```bash
git clone <repo> /home/ubuntu/acore-portal && cd /home/ubuntu/acore-portal
cp .env.prod.example .env.prod   # 填 SESSION_SECRET / MYSQL_PASSWORD / SITE_DOMAIN …
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build
```

- `--env-file .env.prod` 必须带:compose 的**变量插值**取自 env 文件,`env_file:` 段只管容器内环境变量,两者不是一回事
- `SESSION_SECRET` 用 `openssl rand -hex 32` 生成;`MYSQL_PASSWORD` 与 `.env.prod` 的 `DATABASE_URL` 须一致
- **数据库密码用 `:?` 强制必填**:漏填时 compose 直接报错退出,不会用弱默认值建库

### 1.1 与旧 WP 栈同机换栈

生产头一回上线时,旧 WordPress 栈还在同一台机上占着 80/443 与宿主机 3306。两栈同机换栈的做法:

| 步骤 | 命令 | 要点 |
| --- | --- | --- |
| ① 取源码 | `curl -sL https://codeload.github.com/<repo>/tar.gz/refs/heads/main \| tar xz` | **不要用 `git clone` 拉大仓**:某些网络下 git 的 smart-HTTP 传 pack 会超时(`Connection timed out`),而 HTTPS 取 tarball 是秒级。增量更新时只覆盖源码,**排除 `workspace/` 与 `.env.prod`**(前者是数据卷) |
| ② 起库 | `up -d mysql redis` | 先只起 db/redis;**caddy 暂不起**(会抢 80/443) |
| ③ 建表 | `--profile migrate run --rm migrate` | 业务库 schema 由 Prisma 迁移建,不挂 initdb |
| ④ 灌源库 | WP dump 导入同实例的 `wp_legacy` schema | 源库与目标库必须**同一 MySQL 实例**(见 §2.1) |
| ⑤ 灌配置 | `system_config` 灌库 | 凭据脚本放宿主 `/tmp` 且 `chmod 600`,**不入库**(本仓是 public) |
| ⑥ 起 web | `up -d web` | web 只绑 `127.0.0.1:3000`,不抢公网口 |
| ⑦ 跑迁移链 | 见 §2.1 | 容器内执行;媒体组要真上传,耗时随件数量级 |
| ⑧ 冒烟 | 见 §4 | 用 `127.0.0.1:3000` 直连验,**不依赖 DNS** |
| ⑨ 切流 | 停旧栈 → `up -d caddy` | **先停旧栈再起 caddy**(同抢 80/443);caddy 自动签发 Let's Encrypt 证书(DNS 已指向本机时) |
| ⑩ 巡检 | 见 §4 | 公网入口全项复验 |

**回滚**:DNS 本就不用改(域名一直指向本机),回滚 = `down` 门户 compose + `up -d` 旧栈 compose,约 1 分钟。
旧栈的容器/卷/库/uploads 一律**保留不删**,它是回滚的最后保险。

**内存**:Next 的**构建峰值内存远高于运行时**,内存偏紧的机器上先加 swap
(`fallocate -l 4G /swapfile` + `swapon` + 写 `/etc/fstab`),否则构建会被 OOM 打断。

### 1.2 老站换栈时必须核对的「对外服务清单」

老 WordPress 栈不只提供网站,还提供**游戏通道的 TCP 代理**。换栈时只盯着 80/443(网站)会漏掉这一层
——漏了就是**全体玩家登录不了**。

| 老栈提供的 | 协议/端口 | 换栈后的归属 |
| --- | --- | --- |
| 网站(HTTP/HTTPS) | 80 / 443 | 门户栈的 **Caddy** |
| **游戏登录通道** | **TCP 3724** | 门户栈的 **game-stream**(nginx stream) |
| **游戏角色数据通道** | **TCP 8086** | 门户栈的 **game-stream**(nginx stream) |
| 排行榜子站 | HTTP 80(`api.lokta.cn`) | 已停用,门户栈回 410 Gone |

> **玩家客户端连的是本站域名的 3724/8086**,由老栈 nginx 的 **stream 块**(TCP 层,不是 HTTP)
> 转发到游戏机。漏掉这一层 = 全体玩家登录不了。定位手段:游戏机 authserver 日志里的
> 源 IP 是**代理机 IP**(stream 层无 PROXY protocol,游戏服看不到玩家真实 IP)。
>
> 换栈前的必查项:**老栈对外监听的所有端口**(`ss -ltnp`),逐条确认新栈的归属。

**game-stream 的上游地址不入库**:走 `GAME_AUTH_UPSTREAM` / `GAME_WORLD_UPSTREAM` 两个环境变量,
值只落在宿主机的 `.env.prod`(600),仓库里只有模板与占位(本仓是 public)。

### 1.3 账号权限的两处额外授权(业务库账号)

`system_config` 里的连接串用的是**业务库账号**(如 `acore_portal`),它默认只对业务库有权限。换栈时另需两条:

```sql
-- ① 迁移链要读源库 wp_legacy(链的每一步都在读它,缺这条会在第一步 SELECT 失败)
GRANT SELECT ON wp_legacy.* TO 'acore_portal'@'%';
-- ② eluna:AC 侧根本没有 eluna 库(老站的 eluna 配置五项全空),
--    而门户运行时校验要求四库连接串齐 → 在**门户自己的实例**里建一个空库顶上
CREATE DATABASE IF NOT EXISTS acore_eluna CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT SELECT ON acore_eluna.* TO 'acore_portal'@'%';
```

> eluna 这条是**权宜之计**:AC 无 eluna 库,门户不该因它起不来(启动自检会真连四库)。
> 根因修法是把 `gamedb.eluna` 改成可选、自检跳过缺失的库——待单独修。

## 2. 建库与迁移

生产不发布 DB 端口(外部流量只走 caddy;切换期旧 WP 栈还占着宿主机 3306),迁移用一次性服务在容器网络内完成:

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml --profile migrate run --rm migrate
```

- 该服务用 `npx prisma@6.19.3`(版本与 package.json 锁定值一致,升级须同步)
- 生产镜像里没有 prisma CLI(它是 devDependency,Dockerfile 做了 `--prod` 瘦身),故单独用 node 镜像跑
- 宿主无需装 node/pnpm,也无需开放数据库端口

## 2.1 迁移链在生产怎么跑(与上条不同的两件事)

> §2 的 `migrate` 服务只干 `prisma migrate deploy`——它**不是**数据迁移链。
> 数据迁移链(`pnpm migrate:rehearse`,见 `scripts/migrate/README.md`)在生产有两个结构前提:

**① `wp_legacy` 必须与目标库在同一个 MySQL 实例内。**

生产栈**不发布 DB 端口**(外部流量只走 caddy,见 §0),故宿主机上的迁移脚本连不进生产库;
`wp_legacy` 若在宿主机或另一台机器上,链根本够不着它。两个可选解法:

- 把 `wp_legacy` 导进生产 MySQL 实例的独立 schema(推荐;链的连接串指向该实例即可);
- 或在 compose 网络内跑迁移:生产 `migrate` 服务目前是裸 `node:22-slim` 镜像,
  **不含仓库代码与 node_modules**,装不下迁移链——需给该服务挂仓库卷 + 装依赖,
  或另起一个带完整镜像的迁移服务。

**② 生产迁移链需要一个有仓库与依赖的运行环境。**

生产镜像做的是 `--prod` 瘦身,但**仓库代码与 `scripts/` 是在镜像里的**(`Dockerfile` 的 `COPY . .`;
`.dockerignore` 只排 `docs/`、`specs/`)。真正缺的是**依赖归属**:迁移链要用到的 `dotenv`/`mysql2`/`tsx`
原在 devDependencies,被 `pnpm install --prod` 裁掉(修正:此前本文档写「mysql2/bcrypt/dotenv
虽在生产依赖内」是错的——`bcrypt`/`turndown`/`cos-nodejs-sdk-v5` 确实在,`dotenv`/`mysql2` 不在)。

**现行做法**:已把 `dotenv`/`mysql2`/`tsx` 移进 production 依赖,故迁移链**直接在 web
容器内跑**,宿主机无需 node/pnpm:

```bash
docker compose --env-file .env.prod -f docker/docker-compose.prod.yml \
  exec web node scripts/migrate/rehearse.mjs --yes --with-media
```

前置:`MIGRATE_DATABASE_URL` 指向**目标库**(同实例的正式库),`MIGRATE_SOURCE_SCHEMA=wp_legacy`(源 schema),
`MIGRATE_ADMIN_USERNAME`/`MIGRATE_ADMIN_PASSWORD` 显式给(编排器默认用户名 `cutover-admin`,口令无默认值)。
`tsx` 一并移入是因为生产 crontab 的 `scripts/cron/*.ts` 也需要它(运行时镜像无 pnpm,调用
`./node_modules/.bin/tsx`)。**勿改 §2 的 prisma 迁移服务**,两者职责不同。

**③ 迁移链自己要建管理员(媒体组回填的硬前提)。**

`media_asset.uploaded_by` 是非空外键,而迁移链只导 `role=user` 的存量用户,
**链本身不建管理员**。切换前须先在新站建好管理员账号,或给编排器
`MIGRATE_ADMIN_USERNAME` / `MIGRATE_ADMIN_PASSWORD` 让它代建(口令建完即在后台改密)。

**④ 遗留库在运行时仍被查询(未记录的长期依赖)。**

`src/server/services/stats/traffic.ts` 在**运行时**查 `wp_legacy.wp_statistics_summary_totals` /
`wp_statistics_visitor` / `wp_baiduseo_zhizhu`。旧站下线后这些表消失,站点访问统计区块会空/报错。
切换前须确认:要么把 `wp_legacy` 作为长期只读库保留(不进生产 compose 也得有可达的实例),
要么改 `traffic.ts` 改读自建的 `page_view_event` 表(自建采集已上线,数据源本就在新库)。

**现行做法**:选前者——`wp_legacy` **作为生产 MySQL 实例内的长期只读 schema 保留**
(迁移链的源库与目标库同实例,天然满足)。因此:

- 该 schema **不得被迁移链的 `--fresh` 删除**(`--fresh` 只作用目标 schema,但操作前仍须确认目标库名);
- `wp_statistics_*` / `wp_baiduseo_*` 这些「二期后置池」数据**在门户运行时仍被读**,不是死数据——
  切换后不可从生产实例里删;
- 迁移链的源/目标连接口径:`MIGRATE_DATABASE_URL`=目标库,`MIGRATE_SOURCE_SCHEMA=wp_legacy`。

## 3. 业务通道配置(部署后进后台配)

`.env.prod` 只放引导级凭据(宪法 v1.0.2);下列全部存 `system_config`,部署后登录后台 `/admin/settings` 逐组保存,保存即热生效(部分例外见 `backup-restore.md` §6):

| 组 | 关键项 | 生产填法 |
| --- | --- | --- |
| 站点 | `app.url` | `https://<SITE_DOMAIN>` |
| 邮件 | `smtp.host/port/user/password/from` | 真实 SMTP 账号 |
| 游戏库 | `gamedb.auth/characters/world/eluna` | 真实游戏库连接串(只读,勿写 DDL) |
| 商城/游戏通道 | `soap.url` + SOAP 账号 | 真实 worldserver 的 SOAP 端点 |
| 对象存储 | COS 桶/CDN | 生产桶(COS 未配时媒体落本地 `workspace/uploads` 兜底) |
| 主题 | `theme.active` + 两套主题的背景图 | `tbc` / `wlk` |

### 3.1 COS 对象的可读性

COS 对象默认**私有**:匿名 GET 返回 403。门户正文里的图是直接引用对象 URL 的
(迁移链按 `image_asset_map` 改写、运行时上传按 `cdnBase` 拼接),所以对象不可读 = **前台图片全挂**
(页面本身 200,图裂,比报错更难发现)。

口径:**逐对象**设 `public-read`,**不把整桶设公有读**——桶内 `backups/db`(数据库备份)与
`media/` 不走上传路径,桶级公有读会一并把它们暴露。

- 迁移链上传已带 `ACL: "public-read"`(`scripts/migrate/cos-upload.mjs`)
- 门户运行时上传已带 `ACL: "public-read"`(`src/server/services/media/library.ts`)
- **存量对象补 ACL**:上传时若未带(历史数据),按 `image_asset_map` 的 `new_url` 逐个
  `putObjectAcl` 补一遍

**排查提醒**:CAM 子账号常无 `GetBucket` 列举权限 → `getBucket` 会返回**空列表而不是报错**,
看起来像"对象不存在"。验对象是否真在,用 `headObject` 或直接匿名 GET,别信列举结果。

## 4. 验证清单

```bash
curl -sI https://<SITE_DOMAIN> | head -1                 # 200 + TLS 证书
docker compose -f docker/docker-compose.prod.yml ps       # 四个服务 healthy/running
docker compose -f docker/docker-compose.prod.yml logs --tail 50 web
```

- TLS 证书由 caddy 自动签发并续期;证书与 ACME 账号落在 `workspace/caddy-data`,**容器重建不丢**(丢了会触发 Let's Encrypt 签发频率限制)
- 首页 `data-theme` 属性应与 `theme.active` 一致
- `security.trustedProxyHops` = **1**(生产域名前**无 CDN/WAF**,腾讯云 CVM 直连 Caddy,应用正前方只有 Caddy 一层可信代理;Caddy 会把观测到的对端地址追加到 XFF 尾部,右起第 1 项即真实客户端 IP)
  - 填 0 或大于实际跳数 → 取不到 IP,全站落进 `unknown` 兜底桶(登录 600 次/分钟**全站共享**)→ 撞库防护形同虚设且一个用户失败全站被锁
  - 填小于实际跳数(将来上了 CDN/WAF 则是 2)→ 取到中间代理 IP,同代理用户共用一个桶、攻击者换 IP 即绕过限流
  - 改动入口:后台「安全设置 → 可信代理跳数」;域名链路变更(加 CDN/高防)时必须同步改
- `home.achievementUrl` = `https://rank.lokta.cn/achievement`、`home.achievementScrolling` = `true`(生产首页要带成就嵌入;滚动条默认开是因为嵌入页内容常高于框高,关掉则底部内容既看不见也滚不到。高度固定 68vh,后台不再可配)
- 媒体上传:图片/PDF ≤10MB、视频 mp4/webm ≤50MB;**公网入口的体积闸门在网关侧也要放开**(反代若设了 `client_max_body_size 1m` 会先于应用层返回 413)

## 5. 备份对接

沿用 `scripts/cron/backup.mjs`(见 `backup-restore.md`),生产需改两处:

- `BACKUP_MYSQL_CONTAINER` → 生产 MySQL 容器名 `acore-portal-prod-mysql-1`
- 脚本用 `docker exec {容器} mysqldump`,容器内可直连 `mysql:3306`,**不依赖发布端口**

## 6. 从旧 WP 栈切换

旧站(nginx+php+mysql8+redis)与新栈端口不冲突的前提是**先停旧栈**再起新栈:

1. 停旧栈的 nginx/mysql(释放 80/443/3306),保留其数据目录与 dump 备份
2. 起新栈 → 迁移 → 后台配业务通道
   - 数据迁移链走 `pnpm migrate:rehearse`(权威顺序见 `scripts/migrate/README.md`),
     **不要手工按脚本逐个执行**——顺序错了事后无从发现(内容/论坛导入的 `NOT EXISTS`
     守卫会让"媒体映射未跑就导内容"永久落死链 URL)
   - 切换前先在新站建管理员账号(媒体库回填的 `uploaded_by` 外键需要),
     并配好 COS 五键(`cos.cdnBase` 缺失时链会失败关闭)
3. DNS 切到新机(或先 hosts 指认验证)
4. 观察 404 采集、SOAP 发货、邮件三条关键链路

**回滚**:DNS 指回旧机即可(新栈数据已落 `workspace/mysql-prod`,不停机保留现场)。

## 7. 发布方式:门户与子站是两套形态

两个仓库的部署形态**不同,不要互相套用**:

| | acore-portal(门户) | acore-ranking(子站 rank.lokta.cn) |
| --- | --- | --- |
| 运行时 | 腾讯云 **CVM + Docker Compose** | 腾讯云 **SCF 容器镜像函数** |
| 发布方式 | **人工在服务器上发布**(见 §7.1) | **流水线自动发布**:develop → staging,main → production |
| 配置载体 | 宿主机 `.env.prod` + 库内 `system_config` | 云函数控制台环境变量(流水线不覆盖) |
| 发布动作 | `git pull` + `docker compose up -d --build` | 换函数镜像(`UpdateFunctionCode`,只传 `Code.ImageConfig`) |

子站的流水线细节见子站仓库 `docs/arch/04部署架构.md`(镜像地址带 `@sha256:` 摘要、按摘要拉取)。
门户**不**接腾讯云 SCF:门户是长驻的 Web 服务,依赖 MySQL + Redis + 常驻进程与本地卷
(`workspace/uploads` 兜底、Caddy 证书目录),SCF 的无状态容器模型不契合这套生命周期;
门户也**不需要**镜像部署那套「只换镜像、不动配置」的收敛——它的运行配置本来就在宿主机与 `system_config` 里。

### 7.1 门户的发布流程(CI 自动化,生产发布经审批放行)

**门户的生产发布走流水线**(CI 不可用时的人工兜底走同一份脚本的 `--build-local` 模式):

| 环节 | 谁来做 |
| --- | --- |
| 构建镜像 | CI 的 `docker-release` job(`release-image.yml`):推到 TCR,tag = `main-<提交短号>`(短 tag 不可变 ⇒ 可精确回滚) |
| **发布到生产** | **人在 GitHub 上批准**:push main 后 `deploy-production` 作业自动进入待部署队列,人点一次批准即发布 |
| 部署动作 | CI 经 SSH 把发布资产同步到生产机(`scripts/deploy.sh` + compose + **`prisma/schema-business` 迁移集**),再跑 `scripts/deploy.sh --env prod --tag <tag>` |

`push main` 后流水线自行推进到 `deploy-production`,**不再有 `workflow_dispatch` 手动触发入口**。
生产发布的这道人工门由 `environment: production` 承担(该环境已配 required reviewer,
批准即放行),它同时提供部署记录与日志。

> **为什么去掉手动 dispatch**:两道人工确认(手动触发 + 审批)同属一人,第二道没有增量
> 安全性;更关键的是手动入口会让「main 已合并但生产没跟上」变成**静默漂移**——
> 实测生产落后 main 23 个提交而无人察觉。push 触发后,每次合并到 main 都
> 留下一条待部署记录,漂移是看得见的待办。作业失败、或待部署被取消时,在 Actions 页对
> 那次 run 选 Re-run all jobs(只重跑失败项可用 Re-run failed jobs),不必另留手动通道。

命名体系与兄弟仓库一致:vars `DEPLOY_HOST` / `DEPLOY_PATH` / `DEPLOY_ROOT`;
secrets `TCR_NAMESPACE` / `TCR_USERNAME` / `TCR_PASSWORD` / `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`。
**仓库为 public,主机地址与凭据一律不入库。**

部署脚本 `scripts/deploy.sh` 与测试栈**同源一份**(CI 发布与人工兜底也是同一份,只是取镜像的方式不同),按顺序做:

1. **预检**——`.env.prod` 存在、compose 可用、迁移集存在、tag 形态合法(`main|develop)-<短号>`);
2. **钉镜像**——`WEB_IMAGE` 写入 `.env.prod`(回滚目标也落在这里,compose 靠它插值);
3. **拉镜像**——从 TCR 拉该 tag(本地已有同 tag 则跳过,回滚场景下仓库不可达也能起);
4. **迁移先行**——`--profile migrate run --rm migrate` 一次性服务(schema 先到位,§2);
5. **迁移台账断言**——三集合比对:应用集(迁移服务实际会应用的迁移集)⊆ 库内台账
   (`_prisma_migrations` 已完成且未回滚)、镜像集(镜像内 `/app/prisma/schema-business/migrations`)
   ⊆ 应用集、台账无未完成行;任一不满足即**在换容器前**中止;
6. **滚动 web**——`up -d --wait --no-deps --no-build web`(只换 web,mysql/redis 数据卷原地复用);
7. **健康检查**——`http://127.0.0.1:3000/api/status` 须 200;
8. **落状态**——`.deploy-state`(status / tag / previous_tag / commit);
9. **镜像清理**——同一仓库**只留最近 3 个镜像**(当前版本与回滚目标永不删)。

第 5/6/7 步任一失败 → 把 `WEB_IMAGE` 退回上一版并重新起容器,旧版本继续服务
(数据库不回滚,迁移 forward-only)。

要点:

- **迁移在换容器之前跑**:新镜像引入的 schema 变更靠一次性 `migrate` 服务,漏跑会读不到新列;
- `.env.prod` 在宿主机且不入库,换容器不丢业务通道凭据;
- **回滚**:首选在 `main` 上 revert 目标提交(走 develop→main 的发布流程)→ 批准后部署 revert
  后的镜像;**分钟级应急**走生产机上的部署脚本直接重发历史 tag
  (`sudo DEPLOY_ROOT=<部署根> DEPLOY_NAMESPACE=<命名空间> bash scripts/deploy.sh --env prod --tag main-<历史短号>`;
  tag 校验只收 `main-*` 前缀,历史 tag 天然合规,旧镜像保留在 TCR 与宿主机)。
  数据库侧的破坏性变更需另备 SQL 回滚脚本(Prisma 迁移 forward-only)。

**人工兜底 = 同一份脚本的本地构建模式**,用于 CI 不可用时的手动发布:

```bash
sudo DEPLOY_ROOT=<部署根> TARGET_COMMIT=<发布提交> \
  bash scripts/deploy.sh --env prod --build-local
```

它现场构建镜像(镜像名 `acore-portal-prod-web:<短号>`),其余语义与 CI 路径完全一致
(台账断言 / 只换 web / 健康检查 / 失败回滚 / 镜像清理);
**不执行任何 git 变更**——只校验发布资产根的 HEAD 已是目标提交且无未提交改动,
拉代码由人做(发布脚本改仓库状态会破坏「回滚 = 回到上一个提交重新构建」这条人工回滚路径的前提)。

### 7.2 为什么生产发布仍需人工批准(自动化的是构建与搬运,不是上线决策)

CI 会**自动构建**镜像并可**自动部署测试栈**,但**生产发布保留人工批准**。
这是有意的,理由与上版(「不发布」)不同——自动化的是搬运,上线决策仍归人:

1. **上线不是「镜像对了」就等于「可以上线」**:门户是全站流量入口,发布窗口还要看
   业务节奏(有没有正在进行的活动/批量发货)。把这一步交给人,是让人保留这个决定权。
2. **生产的爆炸半径不可逆**:测试栈坏了重灌数据即可;生产栈的数据库迁移是 forward-only,
   代码能回滚、**已签发的发货与已扣的积分不能**。人工确认是最后一道闸。
3. **CI 要发布就得拿到宿主机权限**:这条没有消失,只是被收窄了——引入的是**专用 CI 部署密钥**
   (`DEPLOY_SSH_KEY`,只授权到部署目录),不是人的私钥;且它只能执行固化的部署脚本,
   拿不到生产机的交互 shell。
4. **回滚仍需人参与**:Compose 发布没有版本化制品仓的历史语义,回滚 = 重发上一个 tag,
   这个动作本身就要求有人在 GitHub 上点一下(批准),发布与回滚保持同一条路径。

自动化后的门是:`main` 合并 → `docker-release` 构建镜像 + `deploy-production` 进入待部署
→ 人点一次**批准** → 作业跑 §7.1 的同一组命令。

> 「门户 CI 没有 deploy job」指的是**生产栈**。
> **测试栈**已先行自动化,手册见 [staging-deploy.md](staging-deploy.md)。
>
> 两者的镜像来源已统一到「CI 构建 + TCR 供镜像」:
> 测试栈 `push develop` 自动发布,生产栈人工确认后发布。
>
> 生产栈的**发布步骤**已固化为部署脚本(§7.1),
> 但**触发仍由人在服务器上执行**、不接 CI——脚本化的是步骤(校验/构建/迁移/台账断言/健康检查/失败回滚),
> 不是发布时机;「发布与回滚同一条路径」这一条仍然成立。
>
> 生产发布的触发由「`workflow_dispatch` 手动触发」改为
> **「push main 自动进入待部署队列 + `environment: production` 批准」**——`ci.yml` 已删掉
> `workflow_dispatch` 触发与 `deploy_tag` 输入,`deploy-production` 的条件改为
> `push && ref == main`。两道人工确认同属一人、第二道无增量安全性;更重要的是手动入口会让
> 「main 已合并但生产没跟上」静默漂移(push 触发后每次合并都留下一条待部署记录)。
> 人工兜底保留,定位变为「CI 不可用时的手动发布」。
>
> 测试栈 / 生产栈 / CI 发布 / 人工兜底**共用一份
> `scripts/deploy.sh`**——旧的 `scripts/ops/deploy-production.sh` 与 `scripts/ops/deploy-staging.sh`
> 已删(两套流程并存必然漂移:CI 路径原本没有台账断言,兜底路径没有架构闸 / `.deploy-state` / 镜像清理)。
> 取镜像有两种方式:`--tag <tag>` 从 TCR 拉(CI 用),`--build-local` 现场构建(人工兜底用)。
> 迁移台账断言升级为**三集合比对**(应用集 ⊆ 库内台账、镜像集 ⊆ 应用集、台账无未完成行),
> 且 CI 下发资产时**一并带上 `prisma/schema-business`**——迁移集必须与发布镜像同源,
> 否则新镜像要的列没人建(旧资产不同源时会漏跑迁移)。

