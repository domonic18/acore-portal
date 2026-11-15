-- 容器内栈的系统配置覆盖(initdb 自动执行,文件名序最后 ⇒ 跑在 init-system-config.sql 之后)
--
-- 为什么要有这个文件:init-system-config.sql 写的是**宿主机**默认值(游戏库 localhost:3307、
-- SOAP localhost:17878、SMTP localhost:1025),这些地址在容器内指的都是「容器自己」——
-- web 容器读到的配置若是这样,启动自检直接失败(游戏库自检失败 ⇒ 容器 unhealthy ⇒
-- 发布健康检查判失败、连回滚也起不来)。宿主机默认值只对「应用跑在宿主机上」成立。
--
-- 这里只翻译**与容器内可达性有关**的键(服务名在 dev / test 两套 compose 里一致:
-- mysql / mailpit / soap-mock)。与环境(域名)相关的键(app.url 等)不在这里覆盖,
-- 由各环境按需单独改。

UPDATE acore_portal.system_config SET `value`=REPLACE(`value`,'localhost:3307','mysql:3306') WHERE `key` LIKE 'gamedb.%';
UPDATE acore_portal.system_config SET `value`='http://soap-mock:7878/' WHERE `key`='soap.url';
UPDATE acore_portal.system_config SET `value`='mailpit' WHERE `key`='smtp.host';
