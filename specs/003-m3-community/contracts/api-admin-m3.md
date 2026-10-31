# Contract: M3 后台接口（api-admin-m3）

**Feature**: specs/003-m3-community | US4 内容后台 + US6 状态配置
**约定**: 全部接口 `requireApiAdmin`（M2 模式：401/403 + admin_access_violation 审计）；写操作全部记 AuditLog(category=content 或 admin)；Zod 校验入参；**Q4 裁决最小集**——无区块编辑器/版本历史/审核流。

## 文章管理 /api/admin/articles

| 方法/路径 | 语义 | 备注 |
|---|---|---|
| GET `/` | 列表分页 | Query: page/q/status/categoryId；含 draft |
| POST `/` | 新建 | Body: `{ title, slug?, categoryId, bodyMd, excerpt?, status?, tagIds? }`；slug 缺省由 title 音译+id；slug 唯一冲突 422 SLUG_CONFLICT |
| GET `/{id}` | 详情（编辑回填） | |
| PUT `/{id}` | 更新 | 全字段；status draft→published 时写 publishedAt；published→draft 清 publishedAt |
| DELETE `/{id}` | 删除 | 硬删（文章无外键引用，ArticleTag 级联）；审计 article_delete |
| POST `/{id}/tags` | 标签重设 | Body: `{ tagIds: number[] }`（全量替换） |

## 分类/标签管理 /api/admin/article-taxonomies

- GET/POST/PUT/DELETE `/categories` `/categories/{id}`：删除前置校验（有文章引用 → 422 CATEGORY_IN_USE）
- GET/POST/DELETE `/tags` `/tags/{id}`：同名/同 slug 422；删除级联 article_tag

## 静态页管理 /api/admin/pages

- GET `/`（列表）/ POST `/` / GET/PUT/DELETE `/{id}`
- slug 校验 RESERVED_SLUGS（R15）→ 422 SLUG_RESERVED；冲突 422 SLUG_CONFLICT

## 媒体库 /api/admin/media（R13 最小集）

| 方法/路径 | 语义 |
|---|---|
| GET `/` | 列表分页 20/页 + `q` 文件名搜索 |
| POST `/` | 上传（multipart，多文件；白名单 image/*+pdf，单文件 ≤10MB；落 COS media/{yyyyMMdd}/{hash}{ext}，幂等按 hash 键）→ 返回资产行（编辑器插入用 url） |
| DELETE `/{id}` | 删行 + COS 对象；响应含 `warning` 提示正文死链风险（前端二次确认） |

## 渐进计划 /api/admin/progression

- GET `/`（全量列表 sort+date）/ POST `/` / PUT/DELETE `/{id}`
- Body: `{ title, phaseDate, imageUrl?, bodyMd?, status, sort }`；删除时若为当前指针节点 → 同时清 `progression.current_node_id`（审计注明）

## 服务器状态配置 /api/admin/status-config

- GET `/`：`{ enabled, maintenanceMode, currentNodeId }`
- PUT `/`：Body 三键任意子集；写 SystemConfig + `reloadSystemConfig()`（实时生效，FR-221）+ 审计 admin（category=admin，action=status_config_change，payload 前后值）

## 商品精选开关（M2 面扩展）

- PUT `/api/admin/products/{id}` 既有更新接口 Body 增 `featured?: boolean`（R14）；不改路由契约

## 后台页面面（RSC，requireAdmin）

| 路由 | 功能 |
|---|---|
| `/admin/articles` + `/admin/articles/edit/[id]` + `/admin/articles/new` | Markdown 编辑器（GFM+高亮+粘贴上传+TOC 预览，FR-215）/分类标签管理入口 |
| `/admin/pages` | 静态页 CRUD |
| `/admin/media` | 媒体库 |
| `/admin/progression` | 渐进计划节点管理 |
| `/admin/server-status` | 状态人工配置 3 项 |
