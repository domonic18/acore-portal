-- 商品 SKU 契约体检清单(只读;不改任何数据)
--
-- 背景(2026-11-08 商品编辑台重构):
--   发货按 SKU 解析游戏物品(itemsend_{id} / transmog-item_{id}),`game_item_id`
--   只是元数据、不参与发货 ⇒ SKU 与所选物品不一致 = 静默发错物品。
--   服务端已启用交叉校验(见 src/server/services/catalog/admin/products.ts),
--   不合规商品在编辑保存时会被 422 拦下。本脚本用于**一次性摸底**:
--   列出待人工修正的商品,由运营在后台逐个改,脚本本身不自动修数据。
--
-- 执行方式(只读,可反复执行):
--   mysql -h <host> -u <user> -p <业务库名> < scripts/ops/audit-product-sku.sql
--
-- 三类不合规:
--   ① type=service 却带物品前缀 SKU —— 服务类走处理器注册表,物品前缀必然发不出货;
--   ② type=game_item 但未绑定游戏物品 —— 无物品可解析,发货必然失败;
--   ③ itemsend_/transmog-item_ 后缀不是正整数 —— 解析器要求正整数,否则判非法。
--   另附「SKU 与所选物品不一致」与「物品不存在于 world.item_template」两类,
--   后者需连游戏库核对(见文末说明)。

-- 不写死库名:由命令行 -p <业务库名> 指定(生产库名与 dev 不同)。

-- ① 服务类却带物品前缀
SELECT `id`, `sku`, `type`, `name`, `slug`, `status`,
       '服务类带物品前缀 SKU' AS `问题`
  FROM `product`
 WHERE `type` = 'service'
   AND (`sku` LIKE 'itemsend\_%' OR `sku` LIKE 'transmog-item\_%')
 ORDER BY `id`;

-- ② 物品类未绑定游戏物品
SELECT `id`, `sku`, `type`, `name`, `slug`, `status`,
       '物品类未绑定游戏物品' AS `问题`
  FROM `product`
 WHERE `type` = 'game_item'
   AND `game_item_id` IS NULL
 ORDER BY `id`;

-- ③ 物品前缀但后缀不是正整数(含 _stack 形态)
SELECT `id`, `sku`, `game_item_id`, `name`, `slug`, `status`,
       '物品前缀后缀非正整数' AS `问题`
  FROM `product`
 WHERE (`sku` LIKE 'itemsend\_%' OR `sku` LIKE 'transmog-item\_%')
   AND `sku` NOT REGEXP '^(itemsend|transmog-item)_[1-9][0-9]*(_stack)?$'
 ORDER BY `id`;

-- ④ SKU 指向的物品与所选物品不一致(发货会按 SKU 发,故这是「发错物品」的直接证据)
--    取物品ID 时先去掉 _stack 后缀,再取最后一段下划线数字
SELECT `id`, `sku`, `game_item_id`, `name`, `slug`, `status`,
       CONCAT('SKU 指向 #', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(TRAILING '_stack' FROM `sku`), '_', -1), '_', 1),
              ',与所选物品 #', `game_item_id`, ' 不一致') AS `问题`
  FROM `product`
 WHERE `type` = 'game_item'
   AND `game_item_id` IS NOT NULL
   AND `sku` REGEXP '^(itemsend|transmog-item)_[1-9][0-9]*(_stack)?$'
   AND CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(TRAILING '_stack' FROM `sku`), '_', -1), '_', 1) AS UNSIGNED) <> `game_item_id`
 ORDER BY `id`;

-- ⑤ 服务类 SKU 不在发货处理器注册表内(6 个精确键:item-restoration /
--    char-change-race / char-change-faction / char-change-customize /
--    char-change-name / name-unlock;-copy / -copy-N 派生键亦放行)
SELECT `id`, `sku`, `name`, `slug`, `status`,
       '服务类 SKU 未绑定处理器' AS `问题`
  FROM `product`
 WHERE `type` = 'service'
   AND `sku` NOT IN (
     'item-restoration', 'char-change-race', 'char-change-faction',
     'char-change-customize', 'char-change-name', 'name-unlock'
   )
   AND `sku` NOT REGEXP '^(item-restoration|char-change-race|char-change-faction|char-change-customize|char-change-name|name-unlock)-copy(-[0-9]+)?$'
 ORDER BY `id`;

-- 附:SKU 指向的物品在游戏库 item_template 不存在的核对(需连游戏库执行,只读):
--   SELECT p.`id`, p.`sku`, p.`name`
--     FROM `acore_portal`.`product` p
--     LEFT JOIN `acore_world`.`item_template` i
--       ON i.`entry` = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(TRAILING '_stack' FROM p.`sku`), '_', -1), '_', 1) AS UNSIGNED)
--    WHERE p.`type` = 'game_item'
--      AND p.`sku` REGEXP '^itemsend_[1-9][0-9]*(_stack)?$'
--      AND i.`entry` IS NULL;
