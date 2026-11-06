-- system_config 初始配置(宪法 v1.0.2:业务通道配置入库,env 仅基础设施凭据)
-- compose initdb 仅在数据卷首次初始化时执行;已有库请手动补插或按环境改值
-- 默认值为「宿主机跑 pnpm dev」场景(Mailpit/SOAP mock 均映射到 localhost);
-- 容器内跑 web 的栈(如测试环境)改用 compose 服务名,见下方注释块
--
-- SET NAMES utf8mb4 必留:docker-entrypoint-initdb.d 与裸 mysql 客户端的
-- character_set_client 默认 latin1,文件里的多字节字面量(© ® 等)会被二次编码
-- 存成乱码(2026-11-06 CI 演练实测:页脚英文版权声明渲染成 "Â®")。
SET NAMES utf8mb4;
INSERT INTO acore_portal.system_config (`key`, `value`, `updated_at`) VALUES
  ('app.url',           'http://localhost:3000', NOW()),
  ('soap.url',          'http://localhost:17878/', NOW()),
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
  ('gamedb.eluna',      'mysql://acore_reader:reader_pass@localhost:3307/eluna', NOW()),
  ('tools.rankBase',    'https://rank.lokta.cn', NOW()),
  ('tools.dkpUrl',      'https://webdkp.nfuwow.com', NOW()),
  ('site.copyrightEn',
  'World of Warcraft® and Blizzard Entertainment® are all trademarks or registered trademarks of Blizzard Entertainment in the United States and/or other countries.\nThese terms and all related materials, logos, and images are copyright © Blizzard Entertainment. This site is in no way associated with or endorsed by Blizzard Entertainment®.', NOW()),
  ('site.qqGroup',      '184670219', NOW()),
  ('site.qqGroupQr',    '/qq-group-qr.png', NOW()),
  -- WP 原站群号加群短链(qm.qq.com 群 key 由群主在 qun.qq.com 生成)
  ('site.qqGroupJoinUrl', 'https://qm.qq.com/q/hz9TWpqU2A', NOW()),
  -- 登录防滥用阈值(2026-11-06 撞库加固):与 src/lib/config.ts 默认值一致,
  -- 显式落库便于运维在后台设置页核对;生产不挂 initdb,先吃代码默认值
  ('security.trustedProxyHops', '1', NOW()),
  ('security.loginMaxFails', '5', NOW()),
  ('security.loginWindowSec', '900', NOW()),
  ('security.loginLockSec', '900', NOW()),
  ('security.loginIpSoftFails', '20', NOW()),
  ('security.loginIpMaxFails', '50', NOW()),
  ('security.loginIpLockSec', '900', NOW()),
  ('security.loginSoftLockSec', '2', NOW()),
  ('security.loginGlobalMaxPerMin', '60', NOW()),
  ('security.loginMaxConcurrent', '4', NOW()),
  ('security.loginQueueWaitMs', '1500', NOW()),
  ('security.loginUnknownIpMaxPerMin', '600', NOW()),
  -- 未鉴权端点按 IP 限速(2026-11-06 撞库加固 PR-G):窗口 1 小时
  ('security.registerIpMaxPerHour', '10', NOW()),
  ('security.pwresetIpMaxPerHour', '20', NOW()),
  ('security.emailChangeIpMaxPerHour', '20', NOW()),
  -- 未知 IP 共享兜底桶:IP 不可判定时所有请求并成一个桶,须留足余量
  ('security.unknownIpMaxPerHour', '6000', NOW()),
  -- 状态页限速(2026-11-06 撞库加固 PR-H):公开端点,窗口 1 分钟
  ('security.statusIpMaxPerMin', '30', NOW()),
  ('security.statusGlobalMaxPerMin', '120', NOW()),
  ('security.statusUnknownIpMaxPerMin', '600', NOW()),
  -- 阅读计数限速(2026-11-06 撞库加固 PR-I):每次上报都写 DB,窗口 10 分钟
  ('security.artviewIpMaxPerMin', '60', NOW()),
  ('security.artviewArticleMax', '1', NOW()),
  ('security.artviewArticleWindowSec', '600', NOW())
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW();

-- 容器内栈(测试环境)参考取值(compose 服务名互访;真实凭据不入库不入 git):
-- UPDATE acore_portal.system_config SET `value`='https://dev.17aitech.com'  WHERE `key`='app.url';
-- UPDATE acore_portal.system_config SET `value`='http://soap-mock:7878/'    WHERE `key`='soap.url';
-- UPDATE acore_portal.system_config SET `value`='mailpit'                   WHERE `key`='smtp.host';
-- UPDATE acore_portal.system_config SET `value`='<真实SMTP账号>'            WHERE `key`='smtp.user';
-- UPDATE acore_portal.system_config SET `value`='<真实SMTP凭据>'            WHERE `key`='smtp.password';
-- UPDATE acore_portal.system_config SET `value`='noreply@lokta.cn'          WHERE `key`='smtp.from';
-- UPDATE acore_portal.system_config SET `value`=REPLACE(`value`,'localhost:3307','mysql:3306') WHERE `key` LIKE 'gamedb.%';
