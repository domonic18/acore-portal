# Contract: api-admin-m4（设置 / 测试发信 / 看板）

**Branch**: `004-m4-polish` | 依赖: research R9/R12, data-model §2/§5

## GET /api/admin/settings（requireAdmin）

```jsonc
// 200 —— 按组返回；敏感字段只回掩码态
{
  "smtp":   { "host": "…", "port": 465, "user": "…", "from": "…",
              "passwordConfigured": true },
  "captcha": { "enabled": false, "appId": null, "secretId": null, "appSecretConfigured": false, "secretKeyConfigured": false, "misconfigured": false,
                 "secretKeyConfigured": false },
  "security": { "loginMaxFails": 5, "loginWindowSec": 900, "loginLockSec": 900 },
  "notify":   { "pointEmailThreshold": 0 }
}
```

## PUT /api/admin/settings

```jsonc
// 请求：组级全量提交（非空敏感字段=覆写；空/缺省=保持不变）
{ "group": "smtp", "values": { "host": "…", "port": 465, "user": "…",
                               "password": "", "from": "…" } }
// 200 { "ok": true }   // 内部：upsert → reloadSystemConfig → 审计 SETTINGS_CHANGED
```

- group ∈ smtp / captcha / security / notify；非法组 422
- 校验失败 422（zod 字段路径，照 M2/M3 契约口径）；配置校验失败（如 captcha.enabled=true 四件套不齐）422 CAPTCHA_KEYS_REQUIRED
- 审计只落组名/键名/掩码 diff，**任何值不落审计**

## POST /api/admin/settings/test-mail

```jsonc
{ "to": "email" }
// 200 { "ok": true }
// 200 { "ok": false, "error": "SMTP 连接失败（摘要）" }   // 发送失败不 5xx，业务结果回显
```

- 直发不入 outbox；审计 SETTINGS_TEST_MAIL（记 to）

## GET /api/admin/stats（requireAdmin）

```jsonc
// 200
{
  "online": { "source": "probe|degraded", "current": 12 },   // 复用 getServerStatus
  "articleTop": [{ "slug": "…", "title": "…", "views": 321 }], // top10
  "notFoundTop": [{ "path": "/xxx", "count": 45 }],            // 近7日 top10
  "orders7d": { "count": 18, "pointsSpent": 6800 },
  "users7d": { "newRegistered": 25 },
  "pageView": { "pv": 1024, "uv": 388,   // 近 24h 自建采集(page_view_event)
                "topPages": [{ "path": "/news", "count": 96, "share": 9.4 }] }
}
```

> 2026-11-06 变更:原 `umami` 区块(自托管 Umami)下线,改为自建采集 `pageView` 区块
> (客户端 beacon → `/api/track/pageview` → `page_view_event` 表),不再有外部服务依赖。

## 页面

- /admin/settings（requireAdmin RSC）：四组表单 + 测试发信卡片（to 输入 + 结果提示）
- /admin/stats（requireAdmin RSC）：多区块 + 手动刷新；页面访问区块独立容错

## 错误码总表

| 状态 | code | 场景 |
|---|---|---|
| 401 | UNAUTHORIZED | 未登录 |
| 403 | FORBIDDEN | 非 admin |
| 422 | VALIDATION_FAILED / TURNSTILE_KEYS_REQUIRED | zod / 组校验 |
| 503 | DEPENDENCY_UNAVAILABLE | system_config 不可达（照既有口径） |
