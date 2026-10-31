# Contract: 内容前台接口（api-content）

**Feature**: specs/003-m3-community | US3 内容前台 + US6 首页聚合
**约定**: RSC 页面优先经 service 层直取（页面禁直连 prisma），本契约只收 **Route Handler** 面；分页统一 `page`（1 起）+ `pageSize`（归档固定 10）；错误响应统一 `{ error: { code, message } }`。

## GET /api/content/archive

归档列表分页数据（前台归档页 RSC 首渲染走 service；此接口供客户端分页/加载更多）。

- Query: `category` (announcements|news|guides|devlog, 必填) · `page` (默认 1) · `tag?` · `q?`（标题搜索，归档页搜索框）
- 200: `{ items: [{ slug, title, excerpt, publishedAt, views }], total, page, pageSize: 10 }`
- 404 code=ARCHIVE_NOT_FOUND：category 非法
- 只返回 `status=published`，按 `publishedAt desc`

## GET /api/content/article/{slug}

文章详情元数据（正文由 RSC 渲染；此接口供阅读计数上报后的刷新与外链预览）。

- **POST /api/content/article/{slug}/view**：阅读计数自增（Q7 每次访问 +1，R2 原子 UPDATE），幂等口径=HTTP 层无幂等键（WP 同口径）；返回 `{ views }`。详情页 RSC 首渲染**不含**自增（避免预取/爬虫虚增），由页面客户端水合后 POST 一次。

## GET /api/content/page/{slug}

静态页元数据（正文 RSC 渲染）。404 code=PAGE_NOT_FOUND。

## GET /api/content/progression

渐进计划时间轴数据（前台 /progression RSC 首渲染走 service；此接口供状态卡/外部刷新）。

- 200: `{ nodes: [{ id, title, phaseDate, status, imageUrl, excerpt }], currentNodeId, nextNodeId }`
- 排序 `phaseDate asc, sort asc`；`currentNodeId` 来自 SystemConfig 指针（指向已删节点时回退最新 open 节点并记审计 warn）

## GET /api/status

服务器状态聚合（US6，见 [server-status.md](./server-status.md)）。

## 首页聚合（RSC service 直取，无独立接口）

`services/home/` 聚合四区块数据源（最新公告 5 / 状态卡 service 直读 / 当前渐进阶段 / 精选商品 4），页面一次编排；状态卡客户端 30s 轮询走 `GET /api/status`。

## 301 兼容层（middleware，非 API）

| 旧 URL | 新路径 | 机制 |
|---|---|---|
| `/?p={id}`（111 条） | `/post/{slug}` | route_map `p:{id}` |
| `/?page_id={id}`（20 条） | `/{slug}` | route_map `page_id:{id}` |
| `/?cat={id}` | `/{categorySlug}` | route_map `cat:{id}` |
| `/bbs`、`/bbs/*` | `/forum`（子路径折叠） | middleware 路径级写死 |

未命中 route_map 的旧参数 → `/legacy-redirect/[key]` 404 页（M1 行为不变）。
