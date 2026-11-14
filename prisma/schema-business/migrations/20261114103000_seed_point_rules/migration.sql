-- 积分规则基线补种:register=2(新注册即送 2 分)/ badge_grant=0(后台按需调整)。
-- 此前规则行只由 scripts/dev/seed.ts 灌(dev 栈才跑),生产/测试库不跑 dev seed
-- ⇒ point_rule 为空,getEarnAmount 返回 0,新注册不发分(线上已复现)。
-- INSERT IGNORE:已有行(后台调过的值)不覆盖,迁移可重复重放(幂等)。
INSERT IGNORE INTO `point_rule` (`event`, `amount`, `enabled`, `remark`) VALUES
  ('register', 2, 1, '注册奖励'),
  ('badge_grant', 0, 1, '徽章授予奖励分值(后台按需调整)');
