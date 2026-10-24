# US6 存量数据迁移演练报告(T063)

- 演练日期:2026-10-24
- 环境:本地 dev docker 栈(`acore-portal-dev-mysql-1`,3307);wp_legacy = 生产 WP 备份 dump(2026-10-23 导入)
- 脚本版本:`002-m2-shop-points` 分支 T056-T062 交付物;全程幂等口径(legacyWp* 唯一键 / slug / ref_type+ref_id / old_url+file_hash)

## 1. 执行序列与结果

| 步骤 | 脚本 | 结果 |
| --- | --- | --- |
| ① 用户 | `wp-users-import.sql`(M1) | 迁移 **5,645** 户;跳过垃圾户(**687**,user_login>32);空邮箱合成 3 |
| ② 商品/分类 | `shop-import.sql` | 分类导入(slug 幂等);商品 99 中 **61 published**(itemsend_/服务键),0 draft;**1,897 订单全量落库**,行快照 **2,760** |
| ③ D3 口径分布 | 同上报告查询 | completed **1,897** / cancelled 0 / pending+复核 0 —— 全部存量单扣分流水与 `_order_total` 相符 |
| ④ 积分流水 | `import-points.mjs` | 导入 **10,330** 条(woocommerce_payment 1,897 / badge_reward 2,022 / registration 5,544 / recurring 791 / manual 75 / visitor_referral 1);垃圾户流水跳过 687 户 |
| ⑤ D7 对账 | 同上 | 差额户 **0**(流水 SUM 全部等于 mycred_default,无需补录);全量重算 `remainingDiffUsers=0` |
| ⑥ 图片映射 | `cos-upload.mjs --scan-only` | 扫描 **15,297** 文件建映射(image_asset_map 15,297 行);演练模式零上传(无 COS 凭据自动降级) |
| ⑦ 死链扫描 | 同上 | 存量正文引用 **828** 处(195 篇),映射覆盖 **828/828,死链 0**(animate.css 已入扫描白名单) |

## 2. 幂等红线验证(重复跑零新增)

- `shop-import.sql` 第二次执行:全表 count 与 seed 断言不变(T056 集成测试断言覆盖)
- `import-points.mjs` 第二次执行:`imported=0`、`adjustedUsers=0`(NOT EXISTS 幂等)
- `cos-upload.mjs --scan-only` 重跑:`uploaded=0, skippedHash=15,297`(fileHash 相同全跳过)
- 正式切换日:对最新快照按 ①→⑥ 顺序重跑即可,均为幂等 upsert

## 3. 抽样对拍(5 单 + 5 户,10/10 一致)

- 订单:随机 5 单,新站 `point_cost`/`status`/行数 vs wp_legacy `_order_total`/扣分流水/行数 —— **5/5 一致**(2~238 积分档)
- 积分:随机 5 户,新站 `SUM(point_transaction.amount)` vs `wp_usermeta.mycred_default` —— **5/5 一致**

## 4. 集成测试覆盖(T056/T057/T061/T062)

- T056:D3 三分支(扣分相符→completed、无扣分→cancelled、金额不符→pending+复核清单)、transmog 非契约 SKU→draft 不阻塞、行快照角色还原、幂等重跑
- T057:6 类 ref 枚举映射、amount 保号、balance_after=0 口径、垃圾户流水跳过、D7 差额补录+重跑不重复
- T061:富文本 URL 重写(绝对/相对/多引用)、未命中占位回退、重写幂等
- T062:复核清单列表/approve→completed/驳回→cancelled/refunded 终态不翻转/重复 resolve 404
- 全量 `make check`:lint + typecheck + 137 tests 全绿

## 5. 遗留与切换日注意

- **COS 凭据未配置**(cos.* 五键入 system_config,宪法 VI):演练走 scan-only 映射与死链报告;正式执行去掉 `--scan-only` 即真实上传,映射 newUrl 由 ODKU 回填为 cdnBase+key
- 商品 99→61:其余 38 个无 `_sku` 或非发布态,按契约不入库(post_status 非 publish);切换日如需可人工在后台补建
- D3 本轮零复核项;若切换日快照出现金额不符单,复核入口 `/admin/review-items`(approve→completed/驳回→cancelled,审计留痕)
- 演练期间 D7 曾在测试首轮对 dev 全量差额户补录(测试环境预期行为);正式切换以最新快照重算为准
