# Contract: 服务器状态探针（server-status）

**Feature**: specs/003-m3-community | US6（Q6 裁决：p15 字段二分一步到位）
**通道**: 复用 M1 SOAP 命令层（超时/审计）；characters 库经既有只读 client；mock 先行（scripts/dev/soap-mock 扩展），真机核对入 launch-checklist。

## 字段面（FR-221 / p15 定案）

| 字段 | 来源 | 接口可得 | 说明 |
|---|---|---|---|
| 运行状态 `online` | SOAP `.server info` 可达性 | ✅ | true/false；探针超时 2s = false |
| 在线数 `onlineCount` | characters `online=1` 计数 | ✅ | 库口径优先于文本解析（R7 可靠性取舍） |
| 阵营比 `allianceCount / hordeCount` | characters online=1 按 race 聚合 | ✅ | 联盟/部落在线比分 |
| 稳定运行 `uptimeText` | SOAP `.server info` uptime 行解析 | ✅ | 文本原样展示（如 "3 days, 4 hours"）；解析失败 → null；真机中文构建输出「服务器运行时间」,中英文双匹配 |
| 登录队列 `queueCount` | SOAP `.server info` queue 行解析 | ⚠️ 部分版本 | 解析失败 → null，前台显示 N/A；真机无该行 |
| 今日峰值 `todayPeak` | Redis `status:peak:{yyyyMMdd}` | ✅（自算） | 探针成功时 max 更新 |
| 角色总数 `charTotal` | characters count | ✅ | |
| 今日新注册 `todayNewChars` | characters `creation_date` 计数 | ✅ | 真机列 `creation_date TIMESTAMP`(2026-10-29 核对) |
| 当前阶段 `currentStage` | SystemConfig 指针 → progression_node.title | ❌ 人工 | 指针失效回退最新 open 节点 |
| 阶段锚点 `currentStageNodeId` | 同上(指针节点 id) | ❌ 人工 | 2026-11-04 #54 新增:前台「当前阶段」点击直达 `/progression#node-{id}` |
| 维护模式 `maintenanceMode` | SystemConfig | ❌ 人工 | |
| 展示开关 `enabled` | SystemConfig | ❌ 人工 | false 时 /api/status 返回 `{ enabled: false }`，首页状态卡整卡隐藏 |

## GET /api/status 响应

```jsonc
{
  "enabled": true,
  "degraded": false,          // true = 探针离线，前台「数据延迟」徽标 + 上次缓存值
  "online": true,
  "onlineCount": 128,
  "allianceCount": 61, "hordeCount": 67,
  "uptimeText": "3 days, 4 hours",
  "queueCount": null,          // null → 前台 N/A
  "todayPeak": 203,
  "charTotal": 53112,
  "todayNewChars": 17,
  "currentStage": "第一阶段·熔火之心",
  "currentStageNodeId": 2,       // 渐进节点 id,#54 阶段锚点;待定 → null
  "maintenanceMode": false,
  "updatedAt": "2026-10-24T12:00:30+08:00"  // degraded 时为缓存写入时间
}
```

## 行为约定

1. **缓存**：Redis `status:probe` TTL 25s；命中直接返回（含 degraded 态也缓存——SOAP 宕机时不放大重试风暴）
2. **单飞**（2026-11-06 加固）：缓存未命中时抢 `status:probe:lock`（`SET NX EX` 5s）——抢到者执行探针并写缓存，其余请求轮询等缓存落盘（100ms 一次，上限 2.5s），仍等不到才自行探针；锁的释放按持有者标记比对，迟到者不得删除后来者的锁。并发访客因此只触发**一次** SOAP 探针
3. **降级**：探针失败 → 返回上次缓存 + `degraded: true` +「数据延迟」；无缓存（冷启动即失败）→ 数字字段 null，前台按两态渲染断言（SC-208）
4. **峰值**：仅探针成功路径更新（失败不污染峰值）；跨日自然切键
5. **人工配置实时生效**：后台 PUT 后 `reloadSystemConfig()`（M2 既有机制），下次 /api/status 即新值；写审计；改「当前阶段」指针后作废 `status:probe`（阶段名最多滞后一个 TTL）
6. **限速**（2026-11-06 加固）：按客户端 IP `security.statusIpMaxPerMin`（默认 30 次/分）+ 全局 `security.statusGlobalMaxPerMin`（默认 120 次/分）；IP 不可判定落「未知 IP」兜底桶 `security.statusUnknownIpMaxPerMin`（默认 600 次/分），**不放弃限速**；越阈 → 429 `RATE_LIMITED`；Redis 不可用 → 失败关闭 503 `STATUS_UNAVAILABLE`；状态展示开关关闭时直返 `{ enabled: false }`，不占限流额度
7. **SOAP mock 契约**：`.server info` 固定样例文本（含 uptime 行/queue 行/版本行），失败注入=mock health=down（S6 两态用）；2026-10-29 真机核对完毕（中文 uptime 行已兼容，见 launch-checklist §7）
8. **安全**：探针为只读命令；characters 只 SELECT；`/api/status` 公开无鉴权（聚合统计非敏感，角色明细不出库）
