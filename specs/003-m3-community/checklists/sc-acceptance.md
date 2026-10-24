# M3 SC-201~208 核销表(T049)

> 原则 VIII:每条 SC 必须有自动化锚点。本表记录各 SC 的锚点与核销状态(2026-10-24,M3 收口 T050 前置)。
> 核销口径 = 开发环境(mock SOAP/种子+fixture 数据)全绿;依赖真实数据/真机通道的半项顺延 launch-checklist §7,不阻塞开发收口。

| SC | 锚点(测试/脚本) | 核销状态 |
| --- | --- | --- |
| SC-201 论坛存量全量可访问+/bbs/?topic= 301 | `tests/integration/forum-import.test.ts`(T036:行数/作者/时间/状态前缀/幂等重跑零新增)· `tests/e2e/forum.spec.ts`(版块/主题/楼层渲染 + `/bbs` 与 `?topic=/?forum=` 301 FR-219 + 尾斜杠 308 归一) | ✅ 开发环境;259 主题/471 楼层全量对账待正式迁移跑(launch-checklist §7) |
| SC-202 文章 111/静态页 20 全量+?p= 301+死链 0 | `tests/integration/content-import.test.ts`(字段/views 列对列/图片重写/正文死链扫描)· `tests/e2e/content.spec.ts`(归档/详情/静态页前台)· `tests/e2e/route-compat.spec.ts`(?p=→/post 301) | ✅ 开发环境;111/20 全量可达与死链报告归零待正式迁移跑(launch-checklist §7) |
| SC-203 阅读计数迁移对账一致+并发无损 | `tests/integration/content-import.test.ts`(views 列对列断言)· `tests/integration/content-queries.test.ts`(T021 原子自增/并发,SC-203 增量半)· `tests/e2e/content.spec.ts`(views +1 无 JS 精确断言,前台半) | ✅ 三半全核销 |
| SC-204 渐进计划数据化渲染与旧页等价 | `tests/integration/admin-progression.test.ts`(T048:节点 CRUD/指针清除回退)· `tests/integration/content-queries.test.ts`(时间线排序/锚点)· `tests/e2e/content.spec.ts`(指针缺省回退:最新 open/下一 locked,SC-204) | ✅ 开发环境;29 档旧页逐项等价核对待正式迁移数据到位 |
| SC-205 双菜单互斥+多级结构与旧站逐项一致 | `tests/unit/site-nav.test.ts`(T016:游客/authOnly 集合互斥+children 结构)· `tests/e2e/framework.spec.ts`(T020:双状态渲染+菜单可达 SC-205) | ✅ 全核销 |
| SC-206 后台发文→前台渲染闭环+粘贴图片落 COS | `tests/e2e/admin-content.spec.ts`(T034 发文闭环:表格/代码块/图片/TOC 前台全对)· `tests/integration/admin-media.test.ts`(T033 sha256 幂等/删除删对象+审计;COS SDK mock 不出网) | ✅ 开发环境;COS 真实可达性归 launch-checklist §4(五键配置+抽样) |
| SC-207 版主操作全留审计+越权 0 成功 | `tests/integration/forum-moderation.test.ts`(T036:置顶/关闭/软删审计+越权 403)· `tests/e2e/forum.spec.ts`(版主 API 越权:游客 401/user 403+审计) | ✅ 全核销 |
| SC-208 探针两态渲染+人工配置实时生效留痕 | `tests/integration/server-status.test.ts`(T045/T046:两态注入/失败即全空/三键变更 STATUS_CONFIG_CHANGE 审计/指针失效回退告警)· `tests/e2e/server-status.spec.ts`(状态卡渲染+后台三键页) | ✅ 开发环境;`.server info` 真机解析核对归 launch-checklist §7 |
