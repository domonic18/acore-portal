# 数据迁移脚本 runbook

> 缘起:2026-10-26 媒体库空库事故——cos-upload 只写 `image_asset_map`(迁移台账),
> 应用媒体库读 `media_asset`,两本账无人对,用户点「从媒体库选择」才暴露。
> 本文件是把教训固化成的模板,以后每个迁移脚本照此执行。

## 切换日一条命令:迁移链编排器

> 缘起(2026-11-07):迁移链此前是"按记忆手工依次执行"——十几个脚本、顺序有真实依赖,
> 却没有任何一处写着权威顺序。切换日按错顺序 = 少导一段数据,且事后无从发现
> (各脚本只打印自己的报告,没人比对)。现由 `pnpm migrate:rehearse` 收成一处。

```bash
pnpm migrate:rehearse --list                          # 看权威顺序
pnpm migrate:rehearse --target acore_portal_rehearsal --fresh --yes          # 演练(不含媒体组)
pnpm migrate:rehearse --target acore_portal_rehearsal --fresh --yes \
  --with-media --scan-only --cdn-base https://cdn.example.invalid              # 全链演练
```

### 权威顺序(STEPS,写在 `rehearse.mjs` 里,顺序本身就是文档)

| # | id | 内容 | 依赖 | 媒体组 |
| --- | --- | --- | --- | --- |
| 1 | `media-cos` | 媒体上传 COS + 建 `image_asset_map` | — | ✅ |
| 2 | `users` | M1 存量用户 | — | |
| 3 | `shop` | US6 商城存量 | users | |
| 4 | `slug` | 商城 slug 归一 | shop | |
| 5 | `points` | US6 积分流水 + D7 对账 | users | |
| 6 | `content` | M3 内容存量 | media-cos | |
| 7 | `forum` | M4 论坛存量 | users, media-cos | |
| 8 | `route-map-m3` | 旧链映射 M3 | content, forum | |
| 9 | `route-map-m4` | 旧链映射 M4 | route-map-m3 | |
| 10 | `board-descriptions` | 论坛版块说明回填 | forum | |
| 11 | `guide-pages` | 教程升格静态页 | content | |
| 12 | `product-images` | 商品图回填 | media-cos | ✅ |
| 13 | `media-library` | 媒体库回填 | media-cos | ✅ |
| 14 | `media-verify` | 媒体三方对账 | media-library | ✅ |

**`media-cos` 必须最先跑(不是"媒体组最后跑"的那种最后)**——`content-import` /
`forum-import` 在导入时按 `image_asset_map` 重写正文图片 URL,且带 `NOT EXISTS` 守卫:
映射表空时导入照跑不误,但旧 URL 就此永久落库,**事后补跑媒体组救不回来**。

### 连接与 schema 口径

- 连接串:`MIGRATE_DATABASE_URL` > `DATABASE_URL`(缺任一即报错,不猜库);
  源库 schema 默认 `wp_legacy`,可用 `MIGRATE_SOURCE_SCHEMA` 覆盖;目标 schema 取自连接串的库名。
- 迁移脚本**不得**写死目标库前缀或 `host:port` 默认连接串——`tests/unit/migrate-chain.test.ts`
  是这条的脚枪守卫(`连 A 库、SQL 写 B 库` 与 `静默打到测试栈 3308` 都由此拦下)。
- 目标库指定:`--target <schema>`;`--fresh` 会 DROP+CREATE 目标 schema,
  **对正式 schema `acore_portal` 拒绝执行**(要重建须显式 `--allow-drop`)。

### 媒体组前置(否则编排器会拦停)

- **目标库须有管理员**:`media_asset.uploaded_by` 是非空外键,而迁移链只导 `role=user` 的存量用户,
  **链本身不建管理员**。用 `MIGRATE_ADMIN_USERNAME` / `MIGRATE_ADMIN_PASSWORD` 让编排器代建
  (口令只从 env 读,建完在后台改密);或提前在目标库注册后提权。
- **`cos.cdnBase` 须已配置**:缺它时正文图片 URL 会被改写成无效值,`cos-upload.mjs` 因此**失败关闭**
  (不再像此前那样静默降级 scan-only 并写入相对路径 URL)。纯演练可用 `--cdn-base` 占位。

### 对账

链末自动跑 `reconcile.mjs`:`FAIL > 0` → 退出码 1 拦停。媒体组未跑时,内容域死链
是**预期态**(映射表空)→ 降级为 WARN 并点名,不在链中途误判失败。

## 迁移脚本必须

1. **幂等**:重复执行零增量(用 url 等天然键去重,已在库跳过)。
2. **支持 `--dry-run`**:只报告不落库。
3. **完成标准写"应用侧可见结果"**,不是表行数。例:"后台媒体库能搜到旧站文件",
   而非"image_asset_map 有 N 行"。行数只是中间指标。
4. **写入前回答"谁读这张表"**:列出产物的全部消费者;应用读 A 表就写 A 表,
   映射台账 ≠ 应用库。每个消费者要么有写入路径,要么留下"不同步"的决策记录。
5. **跑完即对账**:`DATABASE_URL=… node scripts/migrate/reconcile.mjs`(全链统一断言器,
   有不可解释差额即退出码 1)。媒体三方对账用 `node scripts/migrate/verify.mjs`。
   新迁移涉及新表时,把对账项加进对账器(保持只读、幂等)。

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
| `media-library-backfill.mjs` | `image_asset_map` → `media_asset` | 媒体库回填,原文件名可搜索,uploadedBy=目标库任一 admin 账号 |
| `verify.mjs` | 三方对账 | map ↔ media_asset ↔ product.images,只读 |
| `rehearse.mjs` | 编排 | 迁移链权威顺序 + 逐步执行 + 链末对账,`pnpm migrate:rehearse` |
| `reconcile.mjs` | 对账 | 全链统一对账断言器,`FAIL>0` → 退出码 1 |
| `content-import.mjs` / `forum-import.mjs` / `import-points.mjs` 等 | WP → 业务库 | 文章/开发日志单页转 Markdown/静态页/渐进/论坛/积分等存量导入 |
