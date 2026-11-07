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

宿主机跑 `pnpm migrate:rehearse` 要求宿主机有 node 22 + pnpm + 依赖已装;
生产镜像做的是 `--prod` 瘦身,迁移链要用到的 `mysql2`/`bcrypt`/`dotenv` 虽在生产依赖内,
但仓库代码与 `scripts/` 不在镜像里。切换前二选一:宿主机装好依赖跑,或给 compose 加一个
带完整镜像的迁移服务(勿改 §2 的 prisma 迁移服务,两者职责不同)。

**③ 迁移链自己要建管理员(媒体组回填的硬前提)。**

`media_asset.uploaded_by` 是非空外键,而迁移链只导 `role=user` 的存量用户,
**链本身不建管理员**。切换前须先在新站建好管理员账号,或给编排器
`MIGRATE_ADMIN_USERNAME` / `MIGRATE_ADMIN_PASSWORD` 让它代建(口令建完即在后台改密)。

**④ 遗留库在运行时仍被查询(未记录的长期依赖)。**

`src/server/services/stats/traffic.ts` 在**运行时**查 `wp_legacy.wp_statistics_summary_totals` /
`wp_statistics_visitor` / `wp_baiduseo_zhizhu`。旧站下线后这些表消失,站点访问统计区块会空/报错。
切换前须确认:要么把 `wp_legacy` 作为长期只读库保留(不进生产 compose 也得有可达的实例),
要么改 `traffic.ts` 改读自建的 `page_view_event` 表(自建采集已上线,数据源本就在新库)。

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

## 4. 验证清单

```bash
curl -sI https://<SITE_DOMAIN> | head -1                 # 200 + TLS 证书
docker compose -f docker/docker-compose.prod.yml ps       # 四个服务 healthy/running
docker compose -f docker/docker-compose.prod.yml logs --tail 50 web
```

- TLS 证书由 caddy 自动签发并续期;证书与 ACME 账号落在 `workspace/caddy-data`,**容器重建不丢**(丢了会触发 Let's Encrypt 签发频率限制)
- 首页 `data-theme` 属性应与 `theme.active` 一致
- `security.trustedProxyHops` = **1**(2026-11-07 拍板:生产域名前**无 CDN/WAF**,腾讯云 CVM 直连 Caddy,应用正前方只有 Caddy 一层可信代理;Caddy 会把观测到的对端地址追加到 XFF 尾部,右起第 1 项即真实客户端 IP)
  - 填 0 或大于实际跳数 → 取不到 IP,全站落进 `unknown` 兜底桶(登录 600 次/分钟**全站共享**)→ 撞库防护形同虚设且一个用户失败全站被锁
  - 填小于实际跳数(将来上了 CDN/WAF 则是 2)→ 取到中间代理 IP,同代理用户共用一个桶、攻击者换 IP 即绕过限流
  - 改动入口:后台「安全设置 → 可信代理跳数」;域名链路变更(加 CDN/高防)时必须同步改
- `home.achievementUrl` = `https://rank.lokta.cn/achievement`、`home.achievementScrolling` = `true`(2026-11-07 拍板:生产首页要带成就嵌入;滚动条默认开是因为嵌入页内容常高于框高,关掉则底部内容既看不见也滚不到。高度固定 68vh,后台不再可配)
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
