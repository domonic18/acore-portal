# Quickstart: M3 社区 — 验证场景

**Feature**: specs/003-m3-community | **前置**: M2 全绿基线（137 vitest + 28 E2E）；dev compose（mysql 3307 + redis + soap-mock）；内容/论坛 seed 随 tasks 落地；迁移验证用 wp_legacy 临时库（M1/M2 套路）

> 每场景对应 SC 锚点；`make check`（lint+typecheck+test）必须全绿为一切前提。接口契约以 contracts/ 四文件为准。

## S1 全局框架（SC-205、FR-201~207）

1. **双菜单断言**：游客访问首页 → 菜单含 登录注册引导、不含 我的帐户▾；点积分商店 → 引导登录；登录后（user）→ 我的帐户▾（购物车/结账）出现且登录入口消失；两菜单集合断言互斥
2. **多级菜单逐项断言**：首页｜项目简介｜使用教程｜公告▾(开发日志/渐进计划/封号记录)｜数据库▾(英雄榜/在线玩家/在线地图/DKP查询)｜资讯｜论坛｜积分商店——与旧站结构逐项一致（单测直接断言 SITE_NAV 常量树）
3. 页脚协议/公约/备案链接可达；移动视口（Playwright 375px）汉堡菜单折叠展开全层级
4. 侧栏：归档页组件清单按类型渲染；未登录无积分余额组件；登录后有；最近浏览商品在访问商品详情后出现（localStorage）
5. 页头随机角色头图：注入 characters 抽样失败（client mock 抛错）→ 默认图降级；正常路径头像 race-class-gender 映射正确

## S2 存量迁移与 301（SC-201/202/203、FR-208/213、FR-218/219）

1. `content-import.mjs` 于 wp_legacy 临时库首跑 → article 111 / content_page 20 / 分类 4 / progression 29 断言；HTML→MD 转换抽样 20 篇渲染核对；**幂等重跑零新增**
2. `forum-import.mjs` 首跑 → board 5 / thread 259 / post 722（含主贴楼层 1）；作者映射率报告（authorUserId 非空占比）；前缀剥离抽样；**幂等重跑零新增**
3. **views 对账**（SC-203）：迁移后逐篇 `article.views = wp_post_views.count` SQL 全量比对零差异；并发集成测试：50 线程并发 POST view → 最终 views = 初始+50（无损）
4. **301 全量**（SC-201/202）：脚本遍历 route_map 全部键 `curl -w %{http_code}` 断言 301 + Location 正确；`/bbs`、`/bbs/forumdisplay.php?f=5` 路径级重定向断言；死链扫描 0
5. wp_comments 盘点清单产出（不迁，仅报告行数与归属拆分统计）

## S3 内容前台（SC-202/204、FR-209~214）

1. 归档页：公告 28/资讯 67/资料梳理 15 各自列表分页 10/页（末页余数断言）、publishedAt 排序、draft 不出现
2. 文章详情：`/post/{slug}` 正文渲染（标题锚点 TOC 点击跳转/代码高亮 class 断言/图片 COS URL）；访问后 views +1；Wowhead 链接有 data-wowhead 属性；断网 wowhead 脚本 → 链接降级可点
3. 渐进计划（SC-204）：29 节点按 phaseDate 排序渲染；锚点导航 `#node-{id}`；当前/下一阶段高亮与旧页信息等价核对；locked 节点置灰标识
4. 静态页 5 核心页（about/tutorial/agreement/convention/sitemap）可达且正文正确；`/{随机不存在slug}` → 404；slug=shop 被 RESERVED_SLUGS 拒绝（后台保存 422）
5. 首页四区块：最新公告 5 条/状态卡/当前渐进阶段/精选商品（seed featured 商品 2 件 + 无精选时回退最新上架断言）

## S4 内容后台（SC-206、FR-215~217）

1. 非管理员访问 /admin/articles → 403 + admin_access_violation 审计（M2 守卫回归）
2. **发文闭环**（SC-206）：后台新建文章（MD 含 GFM 表格+```sql 代码块+三级标题+图片）→ 发布 → 前台渲染：表格/高亮/TOC/图片全对
3. 粘贴图片进编辑器 → 自动上传 COS → 编辑器内插入 CDN URL → 前台可访问；媒体库列表/搜索/删除可见该资产
4. 草稿不可见于前台；发布→下稿→归档即时消失（publishedAt 置空）
5. 删除有文章引用的分类 → 422 CATEGORY_IN_USE

## S5 论坛（SC-201/207、FR-219/220）

1. 游客浏览：/forum 版块 5 → /forum/{board} 主题列表（置顶优先）→ /forum/thread/{id} 楼层序号连续；未映射作者显示 authorName 快照不缺渲染
2. **版主权限矩阵**（SC-207）：user 角色调 moderate 接口 → 403 + forum_moderation_violation 审计；moderator → 200；moderator 访问 /admin/* → 403（不可进后台）；admin → 全通过
3. 版主操作：置顶→列表首位；关闭→徽标+closedAt；标签流转 standard/resolved；软删→列表与详情消失（DB 行仍在断言）
4. E2E：版主置顶/关闭/删除全链路 + 审计行断言（action/payload/actor）

## S6 服务器状态（SC-208、FR-221）

1. mock 正常态：/api/status 返回 11 字段契约值；首页状态卡渲染在线数/阵营比/当前阶段；30s 轮询（Playwright fake timer 或双请求间隔断言）
2. **降级注入**（SC-208）：mock health=down → degraded=true +「数据延迟」徽标 + 上次缓存值保留；冷启动即失败 → 数字字段 null 两态渲染
3. 峰值：探针值高于当日已有峰值 → todayPeak 更新；低于 → 不变
4. 后台改 maintenanceMode → 审计 status_config_change（前后值 payload）→ /api/status 即时新值（reloadSystemConfig 生效）；enabled=false → 状态卡整卡隐藏
5. 指针指向已删节点 → 回退最新 open 节点 + 审计 warn

## 验收门

- S1-S5 全绿 + S6 前四项（开发期）；S2 迁移全量在测试环境数据到位后执行（launch-checklist 扩 M3 节：SOAP .server info 真机解析核对 + characters 今日新注册口径核对）
