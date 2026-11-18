-- daily_max 语义翻转(2026-11-18 用户裁决:不做每用户限额,只做全站日闸):
-- 「每用户日问答次数」(值域 0..10000)→「站点当日 Token 总上限」。
-- ① DDL DEFAULT 对齐新默认值;② 旧次数语义的存量值一次性换算为 Token 额度
-- (已是 Token 量级 >10000 的行不触碰)。两条语句均幂等,可重放。

ALTER TABLE `ai_role_binding` MODIFY `daily_max` INTEGER NOT NULL DEFAULT 2000000;

UPDATE `ai_role_binding` SET `daily_max` = 2000000 WHERE `daily_max` <= 10000;
