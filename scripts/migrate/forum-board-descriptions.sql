-- 版块说明补齐(issue #35)
-- 原 WP 版块 post_content 未随 forum-import 迁移,早前导入把 description 写成 NULL。
-- 本脚本仅填充 NULL 行,不覆盖后台已编辑的说明;可重复执行(幂等)。
-- 说明文本取自 wp_posts 对应 post_content 的纯文本化结果(HTML 标签已去除)。

UPDATE forum_board
SET description = '请按照《缺陷反馈格式》反馈问题,QQ群、QQ聊天窗不受理问题反馈。'
WHERE slug = 'feedback' AND description IS NULL;

UPDATE forum_board
SET description = '欢迎在该板块进行游戏中的趣事、糗事、经验交流分享,目前诚招版主中'
WHERE slug = 'share' AND description IS NULL;

UPDATE forum_board
SET description = '账号申诉流程:1、说明问题:在论坛发帖,说明被封时的详细情况(包括被封时间、行为、地点以及角色名称),信息不按规范或缺失则不予受理。2、快速处理:如需要当天处理解封,请找1位游戏时间超过20天的玩家回帖担保;否则,处理时限在2~7天不等。3、回溯日志:GM会进行日志回溯,如果日志与反映情况一致且属于误封情况,会进行解封处理。'
WHERE slug = 'appeal' AND description IS NULL;

UPDATE forum_board
SET description = '对于违反《和谐游戏环境公约》的行为在这里举报,请提供详细的描述、截图或视频。(论坛上传图片方法→上传图片)'
WHERE slug = 'report' AND description IS NULL;

UPDATE forum_board
SET description = '欢迎在此版块交流插件、任务、副本等攻略信息'
WHERE slug = 'strategy' AND description IS NULL;
