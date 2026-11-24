-- 站内检索召回异常处置:重建 InnoDB FULLTEXT 索引(2026-11-20)
--
-- 背景(实测于本机 dev 库,2026-11-20):
--   检索关键词路走 InnoDB FULLTEXT(ngram 解析器,见 services/search/fulltext.ts)。
--   **某些情况下 InnoDB 的 FULLTEXT 索引会进入"失配态"**:
--   失配前的存量行仍能被 MATCH 召回,失配后**新插入的行不再进入索引** ⇒
--   检索静默漏召回(新文章/新商品/新帖子搜不到),且**不报错、不告警**。
--   实测现象:article / forum_thread / product / product_faq 四张表同时中招,
--   content_page 未中招。
--
--   处置手段:**OPTIMIZE TABLE**(InnoDB 下即 recreate + analyze,会重建 FTS 辅助表)。
--   ⚠ **ALTER TABLE ... DROP/ADD FULLTEXT 无效**——它复用同一份已损坏的 FTS 辅助表,
--   实测重建后新行依然搜不到;只有整表 recreate(OPTIMIZE)才恢复。
--
-- 触发条件(**未能稳定复现,故此处只列同期出现的可疑动作,不作因果断言**):
--   ① 存量迁移/清理脚本跑完(删过行的表,如 promote-guide-pages.mjs 按 slug 删文章);
--   ② MySQL 补丁版本原地升级(dev 数据卷 2026-11-11 建,期间容器随 mysql:8.4 浮动标签
--      跨过若干补丁版本;MySQL 对原地升级后的 FULLTEXT 索引有"需重建"的注意事项);
--   ③ 备份恢复到已有 schema(恢复出来的行不进索引)。
--   ⇒ 排查时**不要依赖对触发条件的假设**:直接跑下面的体检段,失配则一律重建。
--
-- 影响面:五张带 FULLTEXT 索引的表
--   article(title / body_md)、content_page(title / body_md)、
--   product(name / description+detail_md)、product_faq(question+answer)、forum_thread(title)
--
-- 执行方式(先备份,再跑;不写死库名,由命令行指定):
--   mysqldump -h <host> -u <user> -p <业务库名> article content_page product product_faq forum_thread > backup.sql
--   mysql -h <host> -u <user> -p <业务库名> < scripts/ops/rebuild-fulltext-index.sql
--
-- 幂等:是。OPTIMIZE 可重复执行;重复执行只是再重建一次表。
-- 代价:OPTIMIZE TABLE 在 InnoDB 下是 rebuild+analyze,期间**持有表锁**;
--   生产库按低峰窗口执行(本仓五张表行数量级为百~万,秒级~分钟级)。
--   ⚠ 生产线上不要对正在写入的表并发大批量导入,否则索引仍会再次失配。

-- ① 只读体检:各表"最新一行是否已被索引"——失配时这里必然为 0
--    (最新行取 created_at 最大者;表为空则跳过该表)
SELECT 'article' AS `表`, COUNT(*) AS `最新行入索引数`
  FROM `article` a
 WHERE MATCH(a.title) AGAINST((SELECT SUBSTRING(a2.title, 1, 4) FROM `article` a2
                                 ORDER BY a2.created_at DESC LIMIT 1) IN BOOLEAN MODE)
   AND a.id = (SELECT id FROM `article` ORDER BY created_at DESC LIMIT 1)
UNION ALL
SELECT 'content_page', COUNT(*)
  FROM `content_page` c
 WHERE MATCH(c.title) AGAINST((SELECT SUBSTRING(c2.title, 1, 4) FROM `content_page` c2
                                 ORDER BY c2.created_at DESC LIMIT 1) IN BOOLEAN MODE)
   AND c.id = (SELECT id FROM `content_page` ORDER BY created_at DESC LIMIT 1)
UNION ALL
SELECT 'product', COUNT(*)
  FROM `product` p
 WHERE MATCH(p.name) AGAINST((SELECT SUBSTRING(p2.name, 1, 4) FROM `product` p2
                               ORDER BY p2.created_at DESC LIMIT 1) IN BOOLEAN MODE)
   AND p.id = (SELECT id FROM `product` ORDER BY created_at DESC LIMIT 1)
UNION ALL
SELECT 'forum_thread', COUNT(*)
  FROM `forum_thread` t
 WHERE MATCH(t.title) AGAINST((SELECT SUBSTRING(t2.title, 1, 4) FROM `forum_thread` t2
                                 ORDER BY t2.created_at DESC LIMIT 1) IN BOOLEAN MODE)
   AND t.id = (SELECT id FROM `forum_thread` ORDER BY created_at DESC LIMIT 1);

-- ② 修复:整表 recreate(重建 FTS 辅助表)——**必须 OPTIMIZE,不能用 ALTER**
OPTIMIZE TABLE `article`;
OPTIMIZE TABLE `content_page`;
OPTIMIZE TABLE `product`;
OPTIMIZE TABLE `product_faq`;
OPTIMIZE TABLE `forum_thread`;

-- ③ 复检:重跑 ① 段,五张表"最新行入索引数"都应为 1(空表除外)
