# M3 内容域存量迁移演练报告(T015 草稿;Polish T050 定稿)

- 演练日期:2026-10-24
- 环境:本地 dev docker 栈(3307);wp_legacy = 生产 WP 备份 dump(2026-10-23 导入)
- 交付物:`scripts/migrate/lib/content-convert.mjs`(T011)+ `scripts/migrate/content-import.mjs`(T013)+ `scripts/migrate/route-map-m3.sql`(T014)+ 死链扩展 `scanContentDeadlinks`(T015);全程幂等口径(legacy_wp_post_id NOT EXISTS / legacy_wp_page_id+slug / legacy_wp_key / old_key 唯一键)
- 范围:US2 内容域(文章/静态页/分类/渐进计划/route_map 三键);topic/forum 两键 US5 T037 随论坛导入扩充

## 1. 执行序列与结果

| 步骤 | 脚本 | 结果 |
| --- | --- | --- |
| ① 分类 | `content-import.mjs` importCategories | 3 分类 slug 幂等(announcements/guides/news);无分类文章 **0 篇**(回退分支未触发) |
| ② 文章 | 同上 importArticles | **110/110 全量入库**(publish 108 + draft 2;auto-draft 1 篇不在导入口径);图片引用 **441 处全映射,未映射 0**;空/畸形 slug 回退 `legacy-{id}` 实际触发 1 篇(legacy-6164) |
| ③ 静态页 | 同上 importPages | 4 页原位更新(seed 同 slug,覆盖 seed 正文):tutorial/about/agreement/sitemap,sort_order 1-4 |
| ④ 渐进计划 | 同上 importProgression | **28 节点全量入库**(21 open + 7 locked;每节点均有图+描述);源页 29 块,"To be continued" 1 行剔除 |
| ⑤ views 对账 | 同上 reconcile | 差异行 **0**(见 §3 关键发现:源 views 数据本身全零) |
| ⑥ 内容死链 | 同上 scanContentDeadlinks | 三落地表(article/content_page/progression_node)**残留 0**(441 处 uploads 引用全部经 image_asset_map 重写) |
| ⑦ 路由映射 | `route-map-m3.sql` | **124 行**:p 108(publish 全量)+ page_id 13 + cat 3 |

## 2. 幂等红线验证(重复跑零新增)

- `content-import.mjs` 第二次执行:articles `scanned=0, imported=0`(NOT EXISTS);pages `inserted=0, updated=4`(slug 命中原位更新);progression `parsed=28, imported=0`(legacy_wp_key UPDATE 命中)
- `route-map-m3.sql` 第二次执行:124 行不变(ODKU 幂等)
- 集成测试 T012 覆盖幂等分支(mini fixture 重跑 scanned=0/updated=1/imported=0)
- 正式切换日:对最新快照按 ①→⑦ 顺序重跑即可,均幂等

## 3. 关键发现(影响口径,Polish 定稿需复核)

- **wp_post_views 实际只覆盖 7 个页面**:type=4/period='total' 共 7 行,全部指向 page(ID 2/11/135/378/584/1287/1323,各 count=1);**文章阅读量源数据全为 0**。views 必迁对账(SC-203)零差异属"源即全零"的平凡满足——前台文章阅读量将从 0 起步,页面阅读量不在导入范围(content_page 无 views 列)。切换日快照若更新了该表,口径不变自动对齐
- **文章 110 vs tasks.md 估算 111**:导入口径 post_status IN (publish,draft);auto-draft 1 篇非公开态,剔除合理
- **页面 20 的去向**:4 content_page(静态内容)+ 9 route_map 功能面(shop/cart/checkout/account/首页×2/progression/devlog/forum)+ 6 M4 功能面未映射(banlist 537/在线查询 1287/dkp 1699/硬核挑战 1880/在线玩家 1897/在线地图 4371——M3 无目标路由,直落 404,M4 落地后补键)+ 1 draft 页跳过(1471)
- **sitemap 页源正文为空**(wp 4182,body_md 0 字符):旧站为动态生成页;/sitemap 需 US3 按路由生成,不依赖导入正文
- **渐进节点日期跨度大**(2023-01 起):phase_date 全非空,open/locked 由 icon+日期双判据;sort 按源顺序 1-28
- **分类计数**:源 cat 计数(27/15/66=108)与 publish 文章数一致;cat 94(featured)0 篇跳过

## 4. 抽样对拍

- 渐进节点前 6 档:title/日期/图(/2023/10/经典旧世.png 等已重写 COS 相对路径)与源页 cp-timeline 区块逐一一致
- views 对账 SQL:article.views ↔ wp_post_views(type=4/total)COALESCE 全等(110 行,差异 0)
- 中文 slug:decodeURIComponent 解码入库(如"来领取《账号修复》问题指南…"),route_map 侧保留 WP 原始百分号编码,Location 编码形态 + Next 路由解码匹配,两端对齐

## 5. 集成测试覆盖(T011/T012)

- T011 单测 9 例:图片重写映射/未映射保留、wowhead 短代码(含 turndown `\[ \]` 转义形态)、slug 解码/回退、excerpt CJK 空格压缩+500 截断、渐进区块解析(open/locked/To be continued/坏 JSON 剔除)、中文日期规范化
- T012 集成 4 例:字段/分类/views/草稿态/死链扫描断言、幂等重跑、静态页插入后原位更新、渐进导入(含图片重写与未定档 NULL)
- 全量 `make check`:lint + typecheck + vitest 全绿

## 6. 遗留与切换日注意

- **topic/forum 两键**未入 route_map(US5 T037 论坛导入时扩);`/bbs` 路径级已由 middleware 写死 301(T008)
- **M4 功能面 6 页**切换日补键(route-map-m3.sql 追加 VALUES 段)
- **图片真实上传**:沿用 M2 结论——dev 演练 scan-only 映射;正式执行 `cos-upload.mjs`(去 --scan-only)后重跑内容导入即可获得 COS 绝对地址重写(当前映射 newUrl 为站点相对路径,前台可直接用)
- 正式切换顺序:cos-upload → content-import.mjs → route-map-m3.sql → 对账输出 JSON 全零(viewsDiffRows=0 / deadlinks.refs=0)即通过
