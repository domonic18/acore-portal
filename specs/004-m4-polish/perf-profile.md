# T038 性能快测(本地 profile 记录)

- 日期:2026-10-25;环境:本地 dev(`pnpm dev`,M 系列 Mac,MySQL 3307 同机,Redis 6381;
  会话=POST /api/auth/login 换 cookie(legacyuser/m1admin,Turnstile 关态直通))
- 方法:warmup 3 次+连续计量 20 次,HTTP 200 计入(脚本 profile-perf-m4.ts 用后即清,
  复跑可参照 M3 profile-perf-m3.ts 形态自建);beacon 跑完 hdel 清理 redis 计数
  - `/account/notifications`:收件箱分页 RSC(T019,cursor 分页+未读聚合)
  - `/admin/stats`:看板聚合 RSC(T027,五区块:在线数/文章 Top/404 Top/交易流水/umami 降级)
  - `POST /api/track/not-found`:404 采集 beacon(T025,redis hincrby 直写)
- 结论:**三项均优(dev 模式未 build 优化),不设 CI 门**(spec 未定 M4 阈值,
  参考 M3 advisory 口径:RSC 页 P95<500ms、轻接口 P95<50ms)

| 指标 | 实测 P50 | 实测 P95 | 最大 |
| --- | --- | --- | --- |
| 收件箱分页 `/account/notifications` | 16.5ms | **19.0ms** | 19.5ms |
| 看板聚合 `/admin/stats` | 21.3ms | **37.7ms** | 50.5ms |
| 404 beacon `POST /api/track/not-found` | 6.4ms | **6.9ms** | 7.0ms |

- 备注:看板 P95 抖动来自五区块并行聚合(含在线数跨库查询);dev 模式下余量充足,
  生产 build 只会更快。
