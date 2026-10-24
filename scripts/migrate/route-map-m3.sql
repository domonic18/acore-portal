-- route_map M3 填充(US2 T014):p / page_id / cat 三键空间全量映射
--   (topic/forum 两键 US5 T037 随论坛导入扩充;/bbs 路径级走 middleware 写死,不入库)
-- 前置:wp_legacy 已导入(M1);目标库已 Prisma migrate
-- 幂等:old_key 唯一键 ODKU,重复执行零新增
-- 范围裁决(2026-10-24):
--   p       仅 publish(草稿/auto-draft 从未公开可访问,无旧链可保);publish 108 篇 slug 全非空;
--           post_name 为 WP 的 URL 编码形态,Location 保留编码即可,Next 路由匹配时自行解码
--   page_id 静态内容 4 页(→content_page 路径)+ 功能面 9 页(→现役路由);
--           M4 功能面 6 页(banlist 537/在线查询 1287/dkp 1699/硬核挑战 1880/在线玩家 1897/在线地图 4371)
--           M3 无目标路由不映射(直落 404,M4 落地后补键);draft 页 1471(渐进计划)跳过
--   cat     公告 1/资讯 83/资料梳理 68 三分类 → 归档路径;featured(94,0 篇)跳过
-- 断言:跑完后 route_map 行数 = 108 + 13 + 3 = 124(见尾部 SELECT)

-- ① 文章:p:{id} → /post/{post_name}(publish 全量)
--   INSERT…SELECT 不支持行别名,8.4 又移除了 VALUES();沿用 M2 无更新幂等式(no-op ODKU)
INSERT INTO acore_portal.route_map (old_key, new_path)
SELECT CONCAT('p:', p.ID), CONCAT('/post/', p.post_name)
FROM wp_legacy.wp_posts p
WHERE p.post_type = 'post' AND p.post_status = 'publish' AND p.post_name <> ''
ON DUPLICATE KEY UPDATE route_map.id = route_map.id;

-- ② 静态内容页:page_id:{id} → content_page 路径(与 content-import PAGE_MAP 对齐)
INSERT INTO acore_portal.route_map (old_key, new_path) VALUES
  ('page_id:2',    '/tutorial'),
  ('page_id:135',  '/about'),
  ('page_id:1407', '/agreement'),
  ('page_id:4182', '/sitemap') AS new
ON DUPLICATE KEY UPDATE new_path = new.new_path;

-- ③ 功能面页:page_id:{id} → 现役路由(商店/渐进/论坛/开发日志/首页)
INSERT INTO acore_portal.route_map (old_key, new_path) VALUES
  ('page_id:8',    '/shop'),
  ('page_id:9',    '/cart'),
  ('page_id:10',   '/checkout'),
  ('page_id:11',   '/account'),
  ('page_id:3949', '/'),
  ('page_id:2796', '/progression'),
  ('page_id:378',  '/devlog'),
  ('page_id:584',  '/forum'),
  ('page_id:1323', '/') AS new
ON DUPLICATE KEY UPDATE new_path = new.new_path;

-- ④ 分类:cat:{id} → 归档路径
INSERT INTO acore_portal.route_map (old_key, new_path)
SELECT CONCAT('cat:', t.term_id),
       CONCAT('/', CASE t.term_id WHEN 1 THEN 'announcements' WHEN 83 THEN 'news' WHEN 68 THEN 'guides' END)
FROM wp_legacy.wp_terms t
WHERE t.term_id IN (1, 83, 68)
ON DUPLICATE KEY UPDATE route_map.id = route_map.id;


-- ⑤ 论坛(T037):topic:{wpTopicId} → /forum/thread/{id}(forum_thread 自增 id,导入后运行)
INSERT INTO acore_portal.route_map (old_key, new_path)
SELECT CONCAT('topic:', f.legacy_wp_topic_id), CONCAT('/forum/thread/', f.id)
FROM acore_portal.forum_thread f
WHERE f.legacy_wp_topic_id IS NOT NULL
ON DUPLICATE KEY UPDATE route_map.id = route_map.id;

-- ⑥ 论坛版块:forum:{wpForumId} → /forum/{slug}(slug 固定映射,forum-import 同源)
INSERT INTO acore_portal.route_map (old_key, new_path)
SELECT CONCAT('forum:', b.legacy_wp_forum_id), CONCAT('/forum/', b.slug)
FROM acore_portal.forum_board b
WHERE b.legacy_wp_forum_id IS NOT NULL
ON DUPLICATE KEY UPDATE route_map.id = route_map.id;

-- 尾部对账:真实存量 108 p + 13 page_id + 3 cat + 259 topic + 5 forum = 388;
-- dev 库另有 seed fixture(topic:2001/2002、forum:1000/1001)→ total 392 属正常
SELECT
  (SELECT COUNT(*) FROM acore_portal.route_map) AS total,
  (SELECT COUNT(*) FROM acore_portal.route_map WHERE old_key LIKE 'p:%') AS posts,
  (SELECT COUNT(*) FROM acore_portal.route_map WHERE old_key LIKE 'page_id:%') AS pages,
  (SELECT COUNT(*) FROM acore_portal.route_map WHERE old_key LIKE 'cat:%') AS cats,
  (SELECT COUNT(*) FROM acore_portal.route_map WHERE old_key LIKE 'topic:%') AS topics,
  (SELECT COUNT(*) FROM acore_portal.route_map WHERE old_key LIKE 'forum:%') AS boards;
