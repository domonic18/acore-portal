# Data Model: M3 社区 — 论坛 + 内容资讯 + 全局框架完善

**Feature**: specs/003-m3-community | **Date**: 2026-10-24
**库**: acore_portal（业务库，Prisma migrations 唯一真相源）；游戏库零 DDL（characters 仅 SELECT 抽样/统计）
**M1/M2 既有复用**: User / AuditLog（category 扩展）/ RouteMap（键空间扩展）/ SystemConfig / ImageAssetMap / Product（+featured 字段）/ UserRole.moderator（M2 已落枚举）

---

## 1. 枚举变更

### 1.1 AuditCategory（audit_category）扩展

| 新增值 | 用途 |
|---|---|
| `content` | 内容域后台操作（文章/页面/分类/标签/媒体/渐进计划 CRUD、发布状态流转） |
| `forum` | 论坛版主操作（置顶/关闭/删除/状态标签流转）+ 版主面越权尝试 |

（既有 soap/mail/security/shop/admin/points 不动）

### 1.2 新增枚举

- `ContentStatus`（content_status）：`draft | published`（article 与 content_page 共用）
- `ProgressionStatus`（progression_status）：`locked | open`（渐进计划节点开放状态）
- `ThreadStatusLabel`（thread_status_label）：`none | standard | resolved | closed`（Q3 字段化：【规范】【已解决】【已关闭】；版主关闭操作写 closed+closedAt）

### 1.3 既有模型扩展

**Product**：+ `featured Boolean default false`（首页精选区块，R14；后台商品表单开关）

---

## 2. 内容域模型

### 2.1 ArticleCategory（article_category）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| name | VarChar(64) | 公告/资讯/资料梳理/开发日志（存量 4 分类） |
| slug | VarChar(64) unique | announcements/news/guides/devlog = 归档路由段 |
| sort | Int | 导航与归档排序 |

### 2.2 Tag（tag）+ ArticleTag（article_tag）

| 字段（Tag） | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| name | VarChar(64) unique | |
| slug | VarChar(64) unique | |

ArticleTag：`articleId BigInt FK` + `tagId BigInt FK`，复合主键 @@id([articleId, tagId])，双向级联删除。

### 2.3 Article（article）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| slug | VarChar(191) unique | `/post/{slug}` URL 段（迁移期 wp slug 缺失时 `{id}-{titletranslit}` 生成） |
| title | VarChar(255) | |
| excerpt | VarChar(500)? | 列表摘要（迁移期从正文纯文本截取；后台可编辑） |
| bodyMd | LongText | Markdown 正文（R1 单格式） |
| categoryId | BigInt FK→ArticleCategory | |
| status | ContentStatus | draft/published |
| publishedAt | DateTime? | 发布时间（排序/归档口径；draft 为 null） |
| views | Int default 0 | 阅读计数（R2；迁移初始化自 wp_post_views） |
| legacyWpPostId | Int? unique | 幂等导入键 |
| createdAt / updatedAt | DateTime | |

索引：`(categoryId, status, publishedAt desc)`、`(status, publishedAt desc)`。
**不变式**：published ⇒ publishedAt 非空（应用层发布流转时写入）。

### 2.4 ContentPage（content_page）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| slug | VarChar(64) unique | 根级路由段；保存时校验 RESERVED_SLUGS（R15） |
| title | VarChar(255) | |
| bodyMd | LongText | |
| status | ContentStatus | |
| sortOrder | Int default 0 | 网站地图页排序 |
| legacyWpPageId | Int? unique | 幂等导入键 |
| createdAt / updatedAt | DateTime | |

---

## 3. 渐进计划域

### 3.1 ProgressionNode（progression_node）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| title | VarChar(128) | 阶段/节点标题 |
| phaseDate | Date | 显式日期（时间轴排序键，FR-211） |
| imageUrl | VarChar(500)? | 配图（COS URL，迁移重写） |
| bodyMd | LongText? | 富文本说明 |
| status | ProgressionStatus | locked/open 开放状态 |
| sort | Int | 同日期稳定排序 |
| legacyWpKey | VarChar(64)? unique | 存量 29 档幂等键 |

**当前阶段** = SystemConfig `progression.current_node_id`（人工指针，R8）；**下一阶段** = 时间轴上当前节点之后第一个节点（推导）。

---

## 4. 论坛域（只读，Q1）

### 4.1 ForumBoard（forum_board）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| slug | VarChar(64) unique | `/forum/{board}` |
| name | VarChar(64) | |
| description | VarChar(255)? | |
| sort | Int | |
| legacyWpForumId | Int? unique | 幂等导入键（存量 5 版块） |

### 4.2 ForumThread（forum_thread）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| boardId | BigInt FK→ForumBoard | |
| title | VarChar(255) | 迁移期剥离状态前缀后的净标题 |
| authorUserId | BigInt? FK→User | 能映射时填（置 null: Set null 级联） |
| authorName | VarChar(64) | 作者快照（R4，渲染永不依赖映射成功） |
| pinned | Boolean default false | 版主置顶 |
| closedAt | DateTime? | 版主关闭时间 |
| statusLabel | ThreadStatusLabel default none | Q3 状态标签 |
| viewCount | Int default 0 | 存量迁移 + 详情访问自增（同 R2 原子口径） |
| replyCount | Int default 0 | 缓存列（迁移期写入=楼层数-1；只读论坛无增量写路径） |
| lastPostAt | DateTime | 主题列表默认排序键 |
| legacyWpTopicId | Int? unique | 幂等导入键（存量 259） |
| deletedAt | DateTime? | 版主软删（R5） |
| createdAt / updatedAt | DateTime | |

索引：`(boardId, deletedAt, pinned desc, lastPostAt desc)`。

### 4.3 ForumPost（forum_post）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| threadId | BigInt FK→ForumThread | 级联删除 |
| floor | Int | 楼层序号（1=主贴），迁移期按 wp 早序分配 |
| authorUserId | BigInt? FK→User | 同 R4 双字段快照 |
| authorName | VarChar(64) | |
| contentHtml | MediumText | 净化后 HTML（迁移期 sanitize 白名单过滤后落库；渲染层二次 sanitize 纵深） |
| legacyWpPostId | Int? unique | 幂等导入键（存量 471 回复 + 259 主贴=722 行） |
| deletedAt | DateTime? | 版主软删 |
| createdAt / updatedAt | DateTime | |

索引/约束：`unique(threadId, floor)`、`(threadId, deletedAt, floor asc)`。

---

## 5. 媒体库

### 5.1 MediaAsset（media_asset）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | BigInt PK | |
| cosKey | VarChar(255) unique | COS 对象键 |
| url | VarChar(500) | CDN 公开 URL（直接入库，避免读取时拼装） |
| originalName | VarChar(255) | |
| sizeBytes | Int | |
| mimeType | VarChar(64) | |
| uploadedBy | BigInt FK→User | |
| createdAt | DateTime | |

索引：`(createdAt desc)`（列表页）。删除=删行+COS 对象（R13 二次确认口径，不追踪引用）。

---

## 6. 配置与缓存键

### 6.1 SystemConfig 新增键（lib/config.ts 配置组 `status.*` / `progression.*`）

| 键 | 值型 | 说明 |
|---|---|---|
| `status.enabled` | bool | 服务器状态卡展示开关（US6 人工项） |
| `status.maintenance_mode` | bool | 维护模式徽标（US6 人工项） |
| `progression.current_node_id` | string(BigInt) | 当前渐进阶段指针（US6 人工项 + 首页卡） |

### 6.2 Redis 键（非账务数据，可丢失）

| 键 | TTL | 说明 |
|---|---|---|
| `status:probe` | 25s | 探针聚合结果 JSON 缓存（30s 前台轮询不穿透 SOAP） |
| `status:peak:{yyyyMMdd}` | 48h | 今日在线峰值（每次探针成功 max 更新） |
| `header:random-char` | 60s | 随机头图抽样结果平滑缓存 |

### 6.3 RouteMap 键空间扩展（R6）

`LEGACY_KEY_PATTERN` → `/^(p|page_id|cat|topic|forum):(\d+)$/`；`/bbs` → `/forum` 为 middleware 路径级写死重定向（不入库）。

---

## 7. 状态机

### 7.1 文章发布状态机

```
draft ──发布──> published ──下稿──> draft
（发布写 publishedAt=now；下稿保留 publishedAt？否——回 draft 置空 publishedAt，归档即时消失）
```

### 7.2 论坛版主操作流（无状态机，全部独立标记位 + 审计）

置顶/取消置顶 → pinned 翻转；关闭/重开 → closedAt 写/清 + statusLabel↔closed；删除 → deletedAt 写（不可逆恢复走 DB，后台无恢复入口）。

---

## 8. 迁移数据面（对账锚点）

| 源（wp_legacy） | 量级 | 去向 | 幂等键 |
|---|---|---|---|
| wp_posts(post_type=post) | 111 | article | legacyWpPostId |
| wp_posts(post_type=page) | 20 | content_page | legacyWpPageId |
| wp_terms（文章 4 分类 + 标签） | 4 分类 | article_category / tag / article_tag | slug |
| wp_post_views | 全量 | article.views | （UPDATE 口径，重跑=幂等覆盖） |
| 渐进计划条目 | 29 | progression_node | legacyWpKey |
| wp_posts(forum=board) | 5 | forum_board | legacyWpForumId |
| wp_posts(topic) | 259 | forum_thread | legacyWpTopicId |
| wp_posts(reply) | 471 | forum_post | legacyWpPostId |
| wp_comments | 2,089 | **不迁**（文章评论后置；仅盘点清单报告） | — |
