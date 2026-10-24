# T065 性能核对(本地 profile 记录)

- 日期:2026-10-24;环境:本地 dev(`pnpm dev`,M 系列 Mac,MySQL 3307 同机,/shop 数据量=迁移后 99 商品 61 published)
- 方法:`scripts/dev/profile-perf.ts`(warmup 3 次+连续计量 20 次)
  - `/shop`:完整 RSC 页面渲染(分类栏+24 卡+分页),HTTP 200 计入
  - `POST /api/checkout`:纯事务口径(结账 API 发货为 fire-and-forget,不计入,符合任务「不含发货」);
    legacyuser+临时 2 分商品,发货走 soap-mock,订单/流水用后即清
- 结论:**两项均大幅优于阈值,不设 CI 门**

| 指标 | 阈值 | 实测 P50 | 实测 P95 | 最大 |
| --- | --- | --- | --- | --- |
| `/shop` 列表渲染 | P95 < 500ms | 15.8ms | **16.9ms** | 18.9ms |
| 结账提交(不含发货) | P95 < 1s | 7.5ms | **9.0ms** | 79.1ms(单次离群) |

- 备注:dev 模式(未 build 优化)下已达标;结账离群点为事务尾 GC/连接池抖动,不影响 P95。
  复跑方式:`pnpm dev` 起后 `pnpm tsx scripts/dev/profile-perf.ts`(可 `PERF_BASE_URL` 覆盖目标)。
