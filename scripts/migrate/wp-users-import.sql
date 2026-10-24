-- wp_users → user 存量用户迁移(测试环境首跑 2026-10-23;切换日对最新快照重跑)
-- 前置:
--   1) 目标库已完成 Prisma migrate(db:deploy)
--   2) 生产 WP 备份 dump 已导入同实例 wp_legacy 库:
--      gzcat wordpress-full-*.sql.gz | mysql -u<user> -p wp_legacy
-- 迁移规则(宪法 IV 双格式勘误 / research R10):
--   * password_hash 原样保留;algo 按前缀判定:$P$→phpass,$wp$→bcrypt_wp
--   * user_login >32 字符的注册为垃圾账号(实测 687 户全为英文句式样本,非邮箱样式),
--     游戏账号名上限即 32 字符,一律跳过并在结果中报告数量
--   * 空邮箱(实测 3 户)合成 legacy{ID}@migrated.lokta.cn,保证 NOT NULL UNIQUE
--   * user_registered 零值日期回退 2010-01-01(MySQL 8 严格模式不接受 0000-00-00)
--   * wp_user_id 保留原 WP ID(切换日对账锚点);role=user,status=active
-- 幂等: 重跑前先清理上批迁移行(wp_user_id IS NOT NULL),不影响环境内手工注册账号

-- 清理上批迁移行
DELETE FROM acore_portal.`user` WHERE wp_user_id IS NOT NULL;

INSERT INTO acore_portal.`user`
  (username, email, password_hash, password_algo, nickname, wp_user_id, created_at, updated_at)
SELECT
  w.user_login,
  IF(w.user_email = '', CONCAT('legacy', w.ID, '@migrated.lokta.cn'), w.user_email),
  w.user_pass,
  CASE WHEN w.user_pass LIKE '$wp$%' THEN 'bcrypt_wp' ELSE 'phpass' END,
  NULLIF(w.display_name, ''),
  w.ID,
  CASE WHEN w.user_registered < '1950-01-01' THEN '2010-01-01 00:00:00'
       ELSE w.user_registered END,
  NOW()
FROM wp_legacy.wp_users w
WHERE CHAR_LENGTH(w.user_login) <= 32
  AND NOT EXISTS (
    SELECT 1 FROM acore_portal.`user` u
    WHERE u.username = w.user_login COLLATE utf8mb4_unicode_ci
  );

-- 迁移结果报告
SELECT
  (SELECT COUNT(*) FROM acore_portal.`user` WHERE wp_user_id IS NOT NULL) AS migrated,
  (SELECT COUNT(*) FROM wp_legacy.wp_users WHERE CHAR_LENGTH(user_login) > 32) AS skipped_spam_long_login,
  (SELECT COUNT(*) FROM acore_portal.`user` WHERE email LIKE 'legacy%@migrated.lokta.cn') AS synthesized_email,
  (SELECT COUNT(*) FROM acore_portal.`user`) AS total_in_user_table;
