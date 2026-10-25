# Contract: api-notification（通知中心）

**Branch**: `004-m4-polish` | 依赖: research R3/R4, data-model §1

## 端点（全部 requireSession，仅本人数据）

### GET /api/account/notifications/unread

```jsonc
// 200
{ "count": 3 } // 未读数；弹泡轮询用（前端 60s 间隔）
```

### GET /api/account/notifications?cursor=&limit=10

游标分页（createdAt desc, id desc；照 points 流水分页先例）：

```jsonc
// 200
{
  "items": [{
    "id": "string", "type": "points", "title": "积分入账 +2",
    "body": "注册奖励…当前余额 12", "linkUrl": "/account/points",
    "readAt": null, "createdAt": "ISO"
  }],
  "nextCursor": "string | null"
}
```

### POST /api/account/notifications/read

```jsonc
// 请求
{ "ids": ["…"] }        // 单条/批量
{ "all": true }          // 全部已读（与 ids 二选一）
// 200 { "marked": 2 }
```

## 写入路径（无公开 API）

- 站内信仅由账本阻塞点同事务写入（services/notification/notifyPointsChange(tx, …)）；无用户/管理员手写入口（M4 无群发，YAGNI）
- 已读不可逆（无「标记未读」）；删除不做（M4）

## 弹泡口径

- 登录态客户端 60s 轮询 unread；count 较上次增加 → toast「你有 N 条新通知」点击跳收件箱；轮询失败静默（不打扰）

## 测试口径

- 集成：五类账本事件→通知行内容/收件人/事务性（回滚不残留）；unread 计数与 readAt 流转；分页游标稳定性；越权（读他人 404/403 口径照 M1 防枚举——用 404）
- E2E：注册→收件箱可见注册奖励通知→全部已读→徽标清零
