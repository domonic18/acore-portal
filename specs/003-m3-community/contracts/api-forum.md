# Contract: 论坛接口（api-forum）

**Feature**: specs/003-m3-community | US5 论坛（Q1 裁决：**完全只读**——前台零写路径，写路径仅版主管理）
**约定**: 浏览面 RSC service 直取为主；版主操作走 Route Handler（requireModerator）；全部版主写操作记 AuditLog(category=forum)。

## 浏览面（无独立 API，RSC 直取）

| 路由 | 数据 |
|---|---|
| `/forum` | 版块列表（含每版块主题数/最新主题，service 聚合） |
| `/forum/{board}` | 主题列表分页 20/页：`pinned desc, lastPostAt desc`，`deletedAt=null` 过滤 |
| `/forum/thread/{id}` | 楼层列表分页 20/页：`floor asc`；`deletedAt=null`；主贴楼层 1 置顶渲染 |

- 已关闭主题：详情可读，页头「已关闭」徽标（无回帖入口本来就不存在——只读站关闭纯标记）
- 状态标签徽标：statusLabel 映射【规范】【已解决】【已关闭】（closed 双表达时徽标以 closedAt 为准）

## POST /api/forum/moderate/thread/{id}/pin

版主置顶/取消置顶。

- Body: `{ pinned: boolean }`
- 200 `{ pinned }` + 审计 `forum_thread_pin`（payload: threadId, pinned）
- 401 UNAUTHORIZED / 403 FORBIDDEN（user 角色尝试 → 审计 `forum_moderation_violation`）/ 404 THREAD_NOT_FOUND

## POST /api/forum/moderate/thread/{id}/close

版主关闭/重开。

- Body: `{ closed: boolean }`
- 200 `{ closed, statusLabel }`（closed=true ⇒ closedAt=now + statusLabel=closed；false ⇒ 双清）
- 审计 `forum_thread_close`；越权同上

## POST /api/forum/moderate/thread/{id}/label

状态标签流转（Q3：【规范】standard /【已解决】resolved /【无】none；closed 仅经 close 接口设置）。

- Body: `{ label: "none" | "standard" | "resolved" }`（传 closed → 422 code=LABEL_INVALID）
- 审计 `forum_thread_label`；越权同上

## DELETE /api/forum/moderate/thread/{id}

版主软删（thread + 楼层同事务 deletedAt；数据保留）。

- 200 `{ deleted: true }` + 审计 `forum_thread_delete`（payload 含 title 快照）；越权同上

## 版主权限矩阵

| 角色 | /forum 浏览 | 版主操作 | /admin 后台 |
|---|---|---|---|
| guest/user | ✅ | ❌ 403+审计 | ❌（M2 行为不变） |
| moderator | ✅ | ✅ | ❌（R5：只放开论坛版主面，不可进后台） |
| admin | ✅ | ✅ | ✅ |

## 301 兼容层

`/?topic={id}` → route_map `topic:{id}` → `/forum/thread/{id}`；`/?forum={id}` → route_map `forum:{id}` → `/forum/{boardSlug}`；`/bbs` → `/forum`（middleware 写死）。
