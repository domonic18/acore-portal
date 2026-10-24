-- system_config 初始配置(宪法 v1.0.2:业务通道配置入库,env 仅基础设施凭据)
-- compose initdb 仅在数据卷首次初始化时执行;已有库请手动补插或按环境改值
-- 默认值为「宿主机跑 pnpm dev」场景(Mailpit/SOAP mock 均映射到 localhost);
-- 容器内跑 web 的栈(如测试环境)改用 compose 服务名,见下方注释块
INSERT INTO acore_portal.system_config (`key`, `value`, `updated_at`) VALUES
  ('app.url',           'http://localhost:3000', NOW()),
  ('soap.url',          'http://localhost:7878/', NOW()),
  ('soap.user',         'soaper', NOW()),
  ('soap.password',     'change-me', NOW()),
  ('soap.realm',        'Dev', NOW()),
  ('smtp.host',         'localhost', NOW()),
  ('smtp.port',         '1025', NOW()),
  ('smtp.user',         '', NOW()),
  ('smtp.password',     '', NOW()),
  ('smtp.from',         'dev@lokta.local', NOW()),
  ('gamedb.auth',       'mysql://acore_auth_writer:auth_writer_pass@localhost:3307/acore_auth', NOW()),
  ('gamedb.characters', 'mysql://acore_reader:reader_pass@localhost:3307/acore_characters', NOW()),
  ('gamedb.world',      'mysql://acore_reader:reader_pass@localhost:3307/acore_world', NOW()),
  ('gamedb.eluna',      'mysql://acore_reader:reader_pass@localhost:3307/eluna', NOW())
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW();

-- 容器内栈(测试环境)参考取值(compose 服务名互访;真实凭据不入库不入 git):
-- UPDATE acore_portal.system_config SET `value`='https://dev.17aitech.com'  WHERE `key`='app.url';
-- UPDATE acore_portal.system_config SET `value`='http://soap-mock:7878/'    WHERE `key`='soap.url';
-- UPDATE acore_portal.system_config SET `value`='mailpit'                   WHERE `key`='smtp.host';
-- UPDATE acore_portal.system_config SET `value`='<真实SMTP账号>'            WHERE `key`='smtp.user';
-- UPDATE acore_portal.system_config SET `value`='<真实SMTP凭据>'            WHERE `key`='smtp.password';
-- UPDATE acore_portal.system_config SET `value`='noreply@lokta.cn'          WHERE `key`='smtp.from';
-- UPDATE acore_portal.system_config SET `value`=REPLACE(`value`,'localhost:3307','mysql:3306') WHERE `key` LIKE 'gamedb.%';
