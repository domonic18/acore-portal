# 数据迁移脚本 runbook

> 缘起:2026-10-26 媒体库空库事故——cos-upload 只写 `image_asset_map`(迁移台账),
> 应用媒体库读 `media_asset`,两本账无人对,用户点「从媒体库选择」才暴露。
> 本文件是把教训固化成的模板,以后每个迁移脚本照此执行。

## 迁移脚本必须

1. **幂等**:重复执行零增量(用 url 等天然键去重,已在库跳过)。
2. **支持 `--dry-run`**:只报告不落库。
3. **完成标准写"应用侧可见结果"**,不是表行数。例:"后台媒体库能搜到旧站文件",
   而非"image_asset_map 有 N 行"。行数只是中间指标。
4. **写入前回答"谁读这张表"**:列出产物的全部消费者;应用读 A 表就写 A 表,
   映射台账 ≠ 应用库。每个消费者要么有写入路径,要么留下"不同步"的决策记录。
5. **跑完即对账**:`DATABASE_URL=… node scripts/migrate/verify.mjs`。
   新迁移涉及新表时,把对账项加进 verify.mjs(保持只读、幂等)。

## 交付走查

- 自动化 e2e 全部使用自播种合成数据(RUN 前缀隔离),**测不到"迁移产物+真实库"组合**;
  迁移类交付必须另做一轮:连真实迁移库,从 UI 把相关功能人工点一遍。
- 自动化测隔离性,人工走查测真实性,两者不可互替。

## 对账口径(verify.mjs)

- **FAIL** = 消费者缺数据(如台账有、媒体库无)→ 退出码 1,拦截交付。
- **WARN** = 无台账/待人工确认(外链图、零图存量商品)→ 退出码 0,不拦截但必须过目。

## 现有脚本

| 脚本 | 方向 | 说明 |
| --- | --- | --- |
| `cos-upload.mjs` | WP 附件 → COS | 记 `image_asset_map`(old_url→new_url),**只记台账不进媒体库** |
| `product-images.mjs` | `image_asset_map` → `product.images` | 存量商品主图+正文图回填,description `\n` 归一 |
| `media-library-backfill.mjs` | `image_asset_map` → `media_asset` | 媒体库回填,原文件名可搜索,uploadedBy=m1admin |
| `verify.mjs` | 三方对账 | map ↔ media_asset ↔ product.images,只读 |
| `content-import.mjs` / `forum-import.mjs` / `import-points.mjs` 等 | WP → 业务库 | 文章/论坛/积分等存量导入 |
