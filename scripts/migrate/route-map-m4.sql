-- route_map M4 填充(US1 T023):工具页六键 page_id → 六工具页薄壳路由
-- 前置:route-map-m3.sql 已执行;六薄壳页已部署(契约 tools-and-seo §六工具页)
-- 幂等:old_key 唯一键 ODKU,重复执行零新增
-- 六键契约源:src/constants/tools.ts TOOL_PAGES(单测 CONTRACT_REPLAY 逐行重放)

INSERT INTO acore_portal.route_map (old_key, new_path) VALUES
  ('page_id:1287', '/online'),
  ('page_id:1897', '/online-players'),
  ('page_id:4371', '/playermap'),
  ('page_id:1880', '/hardcore'),
  ('page_id:537',  '/banlist'),
  ('page_id:1699', '/dkp') AS new
ON DUPLICATE KEY UPDATE new_path = new.new_path;

-- 尾部对账:六键各自存在且指向正确(M3 全量 124 + M4 六键)
SELECT old_key, new_path FROM acore_portal.route_map
WHERE old_key IN ('page_id:1287','page_id:1897','page_id:4371','page_id:1880','page_id:537','page_id:1699')
ORDER BY old_key;
