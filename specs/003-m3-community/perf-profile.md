# T047 性能核对(本地 profile 记录)

- 日期:2026-10-24;环境:本地 dev(`pnpm dev`,M 系列 Mac,MySQL 3307 同机,SOAP mock :7878;
  归档数据=迁移后文章库,文章详情取最长已发布文 body_md 12043 字符)
- 方法:`scripts/dev/profile-perf-m3.ts`(warmup 3 次+连续计量 20 次,HTTP 200 计入)
  - `/announcements`:归档列表 RSC 渲染(分类筛选+分页+卡片列表)
  - `/post/[slug]`:文章详情 RSC 渲染(MD 管线 sanitize+高亮+目录),取最长文章压力
  - `/api/status`:探针缓存命中(warmup 首次可能触发探针写 25s Redis 缓存,计量段 20 次全为命中;
    计量段总耗时远小于 TTL,无缓存穿透)
- 结论:**三项均大幅优于阈值,不设 CI 门**

| 指标 | 阈值 | 实测 P50 | 实测 P95 | 最大 |
| --- | --- | --- | --- | --- |
| 归档列表 `/announcements` | P95 < 500ms | 16.6ms | **17.8ms** | 18.6ms |
| 文章详情 `/post`(12KB MD 管线) | P95 < 300ms | 21.7ms | **23.0ms** | 23.0ms |
| `/api/status` 探针缓存命中 | P95 < 50ms | 5.7ms | **7.8ms** | 8.4ms |

- 备注:dev 模式(未 build 优化)下已达标,生产 build 只会更快。
  复跑方式:`pnpm dev` 起后 `pnpm tsx scripts/dev/profile-perf-m3.ts`(可 `PERF_BASE_URL` 覆盖目标;
  长文 slug 变更时改脚本内 `POST_SLUG`,取 `CHAR_LENGTH(body_md)` 最长的已发布文章)。
