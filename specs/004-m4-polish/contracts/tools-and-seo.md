# Contract: tools-and-seo（六工具页 / route_map 补键 / sitemap / robots）

**Branch**: `004-m4-polish` | 依赖: research R7/R8/R11

## 六工具页路由与 iframe 目标

| 新路由 | 标题 | iframe 目标 | 导航位置 |
|---|---|---|---|
| /online | 在线查询 | https://rank.lokta.cn/ranking | 无（旧站口径：直达+301 可达） |
| /online-players | 在线玩家 | https://rank.lokta.cn/online | 数据库▾ |
| /playermap | 在线地图 | https://rank.lokta.cn/playermap | 数据库▾ |
| /hardcore | 英雄榜（硬核挑战） | https://rank.lokta.cn/hardcore | 数据库▾ |
| /banlist | 封号记录 | https://rank.lokta.cn/banlist | 公告▾ |
| /dkp | DKP 查询 | https://webdkp.nfuwow.com | 数据库▾ |

- 常量收口 `constants/tools.ts`（RANK_BASE / DKP_URL / 六页 meta）
- 每页：SSR 薄壳（metadata 标题）+ tools-iframe（撑满视口 + 常驻「新窗口打开」外链 + 12s 加载超时降级卡）
- 页面自身必须 200（rank/webdkp 可用性不在断言面，SC-301）

## route_map 补键（scripts/migrate/route-map-m4.sql）

| old_key | new_path |
|---|---|
| page_id:537 | /banlist |
| page_id:1287 | /online |
| page_id:1699 | /dkp |
| page_id:1880 | /hardcore |
| page_id:1897 | /online-players |
| page_id:4371 | /playermap |

- INSERT no-op ODKU（MySQL 8.4 形态照 M3）；幂等重跑零新增
- 执行后 web 容器重启生效（route_map 进程内缓存）；切换日并入 launch-checklist 顺序

## sitemap 口径（app/sitemap.ts）

- 含：`/`、/announcements、/news、/guides、/devlog、/progression、/forum、/shop、六工具页、静态页 4（/about /tutorial /agreement /convention）
- 动态：文章 publish（/post/{slug}，lastModified=updatedAt）、商品 published 且 listed（/shop/{slug}）、版块（/forum/{board}）、未关闭主题（/forum/thread/{id}，上限 5000）
- 不含：draft/deleted、listed=0、/admin/*、/account/*、/api/*
- base：config app.url

## robots 口径（app/robots.ts）

```
User-agent: *
Disallow: /admin
Disallow: /account
Disallow: /api
Disallow: /cart
Disallow: /checkout
Sitemap: {app.url}/sitemap.xml
```

## 测试口径

- E2E：六页 200 + iframe src 断言 + 外链按钮存在；六个旧 page_id 301 逐键断言；sitemap.xml 条目数与库 count 对账（SC-309）；robots.txt 内容断言
