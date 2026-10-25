# Quickstart: M4 完善

**Branch**: `004-m4-polish` | **Date**: 2026-10-25 | 依赖: contracts/*, data-model.md

> 每节 = 一组可独立验证的检查点；全部通过 = M4 开发收口（SC-301~309 对应核销）。
> 环境前置：dev compose（3307/6379/8025/7878/3000）或 test compose（3308/6382/8026/9000 + umami 3001）；E2E 一律隔离 schema（AGENTS 口径）。

## S1 工具页与 301（→SC-301）

1. `pnpm dev` 后六路由逐个 200：/online /online-players /playermap /hardcore /banlist /dkp；页面含 iframe（src 与契约表一致）与「新窗口打开」外链
2. `curl -sI 'http://localhost:3000/?page_id=537'` … 六键逐一 301 → 对应新路由；重复执行 route-map-m4.sql 零新增
3. 导航：公告▾封号记录→/banlist；数据库▾四项逐点可达；游客/登录两态菜单均含
4. E2E：tools.spec 六页 + 301 六键 + sitemap/robots（S6 合并断言亦可）

## S2 防滥用（→SC-302/303）

1. 默认（turnstile.enabled 缺省=false）：登录/注册直通，无 widget 渲染
2. system_config 置 turnstile 测试密钥（site `1x…AA` 恒通过）+ enabled=true → 登录页出现 widget，登录成功；重启容器（或 settings 页保存）后生效
3. 换恒失败密钥（site `2x…AB` 本地无 token 语义）→ 无 token POST /api/auth/login → 422 TURNSTILE_FAILED
4. 限速：连续错密 5 次 → 第 6 次 429 RATE_LIMITED；等锁期（或调小 loginLockSec 重启）→ 恢复 401 正常语义；audit 表见 LOGIN_LOCKED
5. 防枚举：不存在用户名连错 5 次 → 同样 429；恢复后 401 文案与真实用户逐字一致
6. 集成测试覆盖 2-5 全分支（Redis 状态注入，TTL 缩短参数化）

## S3 通知域（→SC-304/305）

1. 新注册用户 → 收件箱（/account/notifications）见「积分入账 +2」注册奖励通知；导航未读徽标 =1
2. admin 手调 +50 → 用户侧 60s 内弹泡提示；收件箱见通知且余额快照正确
3. 购买扣分 / 退款 / 徽章授予三条路径各产生一条通知（集成断言 5 类全覆盖）
4. **事务性**：余额不足扣分失败（402）后 notification 表计数不变（回滚不残留）
5. 阈值邮件：notify.pointEmailThreshold=10，手调 +50 → mail_outbox 见 POINTS_NOTIFY 邮件（Mailpit 可视）；改阈值为 100 → 同操作不出邮件（0=关闭亦验证）
6. 已读流转：单条已读/全部已读 → 徽标清零；游标分页翻页无重漏

## S4 统计看板（→SC-306）

1. compose 起 umami：`docker compose -f docker/docker-compose.test.yml up -d umami` → 127.0.0.1:3001 可登录；建 website 得 websiteId
2. system_config 补 umami 五键 → 浏览站内数页 → Umami 后台 PV/UV 增长（采集链路通）
3. /admin/stats 五区块渲染：在线/阅读 top/404 top/近 7 天订单与积分消耗/新注册；数值与 SQL 手查一致（抽查 2 项）
4. 访问不存在路径 → not-found beacon → stats:404:{今日} hash 增计数 → 看板 404 区块出现该路径
5. umami.apiUrl 指向错误端口 → 仅 Umami 区块「暂不可用」，整页 200 其余区块正常
6. 非 admin 访问 /admin/stats → edge 层拦回 /login?next=（M2 口径）

## S5 设置与备份（→SC-307/308）

1. /admin/settings 五组渲染；smtp.password 显「已配置」掩码态，不回显明文
2. 改 SMTP host 为非法值保存 → 422；改回正确值保存 → 审计 SETTINGS_CHANGED（无值泄露）；**发信即热生效**（不用重启：测试发信直达 Mailpit）
3. 测试发信：填 to → Mailpit 收到测试邮件；填错 SMTP 密码再测 → 页面回显失败摘要
4. 备份演练：`node scripts/cron/backup.mjs` → COS 出现 backups/db/lokta-business-{今日}.sql.gz；retentionDays=0 时旧对象被清（可配小值验证）
5. **恢复演练（SC-308）**：按 docs/ops/backup-restore.md 步骤恢复到临时 schema → user/order/article 行数与源一致 → 冒烟 SQL 通过；文档尾注记录演练日期与结果
6. 游戏四库周备：gameWeekly=true + 手动触发（脚本加 --force-weekly 调试参数）→ 四库 dump 上传

## S6 SEO（→SC-309）

1. /sitemap.xml 200：条目含首页/三归档/devlog/progression/forum/shop/六工具页/4 静态页；文章数=publish count、商品数=published count、主题数=未关闭 count（SQL 对账）
2. draft 文章/listed=0 商品不出现在 sitemap
3. /robots.txt 内容与契约一致；Sitemap 行绝对地址=app.url
4. E2E：tools-and-seo 断言（含 301 键）

## 收口门槛

- `make check` 全绿（vitest + E2E 隔离 schema）
- specs/004-m4-polish/tasks.md 全部勾选 + SC 核销表（checklists/sc-acceptance.md 按 M3 先例建）
- launch-checklist 增补节：M4 上线前置项（Umami 生产接线/公网 Turnstile 真密钥/备份 crontab 挂载/游戏库 dump 客户端路径/配置变更重启口径）
- 文档三层同步（AGENTS/README/development-plan M4 状态）
