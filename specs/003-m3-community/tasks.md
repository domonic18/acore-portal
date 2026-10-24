# Tasks: M3 社区 — 论坛 + 内容资讯 + 全局框架完善

**Feature**: specs/003-m3-community | **输入**: [spec.md](./spec.md)（6 US / FR-201~221 / SC-201~208，Q1-Q7 已裁决）· [plan.md](./plan.md) · [research.md](./research.md)（R1-R16）· [data-model.md](./data-model.md) · [contracts/](./contracts/)（api-content / api-forum / api-admin-m3 / server-status）· [quickstart.md](./quickstart.md)（S1-S6）

**Tests 为硬性交付**（宪法 VIII）：每个 US 先写测试（先失败）再实现；`make check`（lint+typecheck+test）全绿为一切前提。迁移脚本即验收工具（幂等重跑+对账内嵌断言，M2 套路）；E2E 一律走隔离 schema `acore_portal_e2e`（AGENTS.md 约定）。

**裁决口径速查**：Q1 论坛完全只读（无发帖/回帖/传图代码路径）· Q2 内容入库 DB 对象 · Q3 状态标签 M3 字段化 · Q4 后台最小集 · Q5 响应式框架级+核心页 · Q6 状态字段照 p15 · Q7 阅读计数每次访问+1。

## 文件路径约定（M1/M2 单体延续）

- 页面 `src/app/`；API `src/app/api/` Route Handlers 薄层；站点壳层组件 `src/components/site/`
- 服务层 `src/server/services/{content,progression,forum,status,media,home,shared}/`；渲染收口 `src/lib/markdown.ts`
- 常量 `src/constants/`（navigation/content/forum/status/legacy-routes/audit 扩展）；依赖方向 `app → server → lib → constants`
- schema `prisma/schema-business/`；迁移脚本 `scripts/migrate/`；测试 `tests/{unit,integration,e2e}/`

---

## Phase 1: Setup（环境与基线）

- [ ] T001 建立 `003-m3-community` 分支，确认 M2 基线全绿：`make check`（lint+typecheck+137 vitest）+ E2E 隔离 schema 28/28
- [ ] T002 测试 seed 扩展：`scripts/dev/seed.ts` 增补 M3 fixtures——moderator 测试账号（role=moderator）、文章 2 分类+草稿/发布各若干、静态页 2、渐进节点 3（含 open/locked）、论坛 2 版块+2 主题+4 楼层（含未映射作者快照行）；E2E 库重跑 db:seed 生效
- [ ] T003 常量层扩展：新建 `src/constants/content.ts`（归档分类配置 announcements/news/guides/devlog、RESERVED_SLUGS 保留字清单、侧栏组件页面类型映射 SIDE_BY_PAGE_TYPE）、`src/constants/forum.ts`（THREAD_STATUS_LABEL 中文映射）、`src/constants/status.ts`（system_config 键名/探针字段清单）；`src/constants/navigation.ts` 增 `SITE_NAV` 多级树（含 authOnly 标记，结构照录 spec US1）；`src/constants/legacy-routes.ts` 键空间扩为 `(p|page_id|cat|topic|forum):(\d+)`（edge 安全纯常量）；`src/constants/audit.ts` 扩 AUDIT_ACTION（content_*/forum_thread_pin|close|label|delete/forum_moderation_violation/status_config_change）

**Checkpoint**: make check 全绿，SITE_NAV 树有单测断言（SC-205 锚点前置）再进 Phase 2。

---

## Phase 2: Foundational（阻塞全部 US）

- [ ] T004 schema 迁移①（枚举+扩展）：ContentStatus/ProgressionStatus/ThreadStatusLabel 三枚举、AuditCategory 加 `content`/`forum`、Product 加 `featured Boolean default false`；`prisma migrate dev`
- [ ] T005 schema 迁移②（内容+渐进+媒体 7 表）：ArticleCategory/Tag/ArticleTag/Article/ContentPage/ProgressionNode/MediaAsset，字段/索引/约束照录 data-model §2/§3/§5（Article.legacyWpPostId unique、ContentPage.legacyWpPageId unique、ArticleTag 复合主键、ProgressionNode.legacyWpKey unique）；`prisma migrate dev`
  - 依赖 T004（同文件串行）
- [ ] T006 schema 迁移③（论坛 3 表）：ForumBoard/ForumThread/ForumPost，双字段作者快照（authorUserId Set null 级联 + authorName）、unique(threadId, floor)、软删 deletedAt；`prisma migrate dev`
  - 依赖 T005（同文件串行）
- [ ] T007 版主守卫：`src/server/session-guard.ts` 增 `requireModerator()`（RSC：moderator|admin 通过，user 越权记 `forum_moderation_violation` 审计后 redirect /forum）+ `requireApiModerator(req)`（仿 requireApiAdmin：401/403+审计统一入口；moderator **不可**访问 /admin 既有行为回归断言）
- [ ] T008 Markdown 渲染管线收口：`src/lib/markdown.ts`——react-markdown + remark-gfm + rehype-highlight + rehype-slug + rehype-sanitize 白名单（GFM 全集+`code[class=language-*]`+`a[data-wowhead]`+`img[src]` 仅 COS 域，research R3）；`extractToc()`（h2-h4 锚点）；wowhead 链接自动标注 `data-wowhead`（R3b）；单测：恶意 script/style/onclick 注入被剥、GFM 表格/代码块通过、TOC 提取正确
- [ ] T009 301 骨架扩展：middleware 增 `/bbs`、`/bbs/*` 路径级 301 → `/forum`；`/legacy-redirect/[key]` 适配新键空间（p/page_id/cat 既有逻辑回归 + topic/forum 透传）；单测 normalizeLegacyKey 新键断言
- [ ] T010 soap-mock 扩展：`.server info` 命令桩（固定样例文本含 uptime 行/queue 行/版本行，契约照录 server-status.md）；失败注入复用既有 `/__fail` 机制；`pnpm soap:mock` 手动验证回执

**Checkpoint**: 迁移可重放；渲染管线 sanitize 单测绿；moderator 守卫就位；mock 状态命令可用。US2 依赖 T005/T006/T009，US1 依赖 T003/T008，US5 依赖 T006/T007/T009，US6 依赖 T010。

---

## Phase 3: US2 — 内容域模型与存量迁移（P0 核心锚点）

**目标**: FR-208~213（迁移与 301 部分）· SC-201(内容半)/202/203 · quickstart S2。数据模型已在 Phase 2，本阶段交付迁移管线与对账面。

**Tests（先写先失败）**:

- [x] T011 [P] [US2] 单测：`tests/unit/content-convert.test.ts` — HTML→MD 转换器（turndown 封装）：图片 URL 经 image_asset_map 重写、wowhead 短代码规范化为标准链接、空 slug 生成回退 `legacy-{id}`、excerpt 纯文本截取 500
- [x] T012 [P] [US2] 集成：`tests/integration/content-import.test.ts` — 测试内建 wp_posts/wp_terms/wp_post_views mini fixture（≤10 行覆盖各分支）→ 跑导入函数 → 行数/字段/幂等重跑零新增/views 列对列一致断言

**实现**:

- [x] T013 [US2] `scripts/migrate/content-import.mjs`：wp_posts(post)→article（111 篇，bodyMd 转换+图片重写+views 初始化）、wp_posts(page)→content_page（20 页）、wp_terms→article_category/tag（4 分类）+ 关联、渐进计划 29 档源摸底→progression_node；全部 ODKU/legacy 键幂等；尾部内嵌对账断言（M2 套路）
- [x] T014 [US2] `scripts/migrate/route-map-m3.sql`：`p:{id}→/post/{slug}`、`page_id:{id}→/{slug}`、`cat:{id}→/{categorySlug}` 全量 INSERT SELECT（幂等 ODKU）；跑后 route_map 行数断言
- [x] T015 [US2] 死链扫描扩展：复用 M2 脚本扫描面扩 article.bodyMd/content_page.bodyMd/progression_node.imageUrl；dev 库真实数据全流程演练（wp_legacy 已在 dev 库）产出 migration-report 草稿（正式报告 Polish 阶段定稿）

**Checkpoint（quickstart S2 内容半）**: dev 库演练 110 文章+4 页+3 分类+28 节点全量入库（口径偏差见 migration-report §3）；幂等重跑零新增；views 对账零差异（源数据全零，见报告）；p/page_id/cat 301 全量生效（route_map 124 行）；死链 0。

---

## Phase 4: US1 — 全局框架完善（可与 Phase 3 并行，文件零交集）

**目标**: FR-201~207 · SC-205 · quickstart S1。

**Tests（先写先失败）**:

- [x] T016 [P] [US1] 单测：`tests/unit/site-nav.test.ts` — SITE_NAV 结构逐项断言（SC-205：多级菜单与旧站一致）；游客/登录两菜单集合互斥断言（authOnly 过滤推导）（T002 时已交付）

**实现**:

- [x] T017 [US1] 随机角色头图：`src/server/services/shared/portrait.ts`（characters 只读 ORDER BY RAND() LIMIT 1 + race/class/gender→`public/portraits/` 映射常量 + 500ms 超时降级默认图 + Redis 60s 平滑缓存，R10）；`public/portraits/` 静态头像集（81 张：8 种族×有效职业×2 性别 + 默认图，`scripts/dev/gen-portraits.mjs` 生成）
- [x] T018 [US1] 页头/页脚组件：服务端壳层 `app/_components/site-header.tsx`（依赖边界：读 session/server 服务的壳层归 app 层）+ 交互层 `components/site/header-client.tsx`（双菜单 authOnly 过滤渲染 + 多级下拉 + 汉堡折叠 + 随机头图）、`components/site/footer.tsx`（协议/公约/项目简介/网站地图）；数据库▾ 四链接 M4 前占位提示；`app/layout.tsx` 接线全站壳层
- [x] T019 [US1] 侧栏组件系统：10 个注册组件（外部三链合 1 组件）+ 注册表 + 按 SIDE_BY_PAGE_TYPE 渲染；纯展示/客户端组件居 `components/site/sidebar/`，读 session/server 服务的服务端组件（公告图链/日历归档/积分余额）与注册表居 `app/_components/sidebar/`（依赖边界）；M2 商品详情浏览埋点 `RecentProductTracker` 写 localStorage（最近浏览数据源）；home 清单含积分余额（登录态门槛在组件内 null）
- [x] T020 [US1] E2E：`tests/e2e/framework.spec.ts` — 游客/登录双菜单互斥+多级结构+汉堡折叠（375px 视口）+页脚链接+侧栏组件清单+未登录无积分余额组件（SC-205）（7/7 通过）

**Checkpoint（quickstart S1）**: 双菜单断言互斥、多级结构逐项一致、头图降级、侧栏按类型渲染。

---

## Phase 5: US3 — 内容前台（依赖 Phase 3 数据 + Phase 4 壳层）

**目标**: FR-209~214 · SC-202(前台半)/204 · quickstart S3。

**Tests（先写先失败）**:

- [ ] T021 [P] [US3] 集成：`tests/integration/content-queries.test.ts` — services/content 查询层：归档分页 10/页+publishedAt 排序+draft 不可见、views 原子自增（50 并发无损=+50，SC-203 增量半）、静态页 slug 查询、渐进计划排序+当前/下一节点解析（指针指向已删节点回退最新 open）

**实现**:

- [ ] T022 [US3] `services/content/`（articles/pages/taxonomies/archive 查询）+ `services/progression/`（时间轴+指针）+ `services/home/`（四区块聚合）；阅读计数 API `POST /api/content/article/[slug]/view`（R2 原子 UPDATE）
- [ ] T023 [US3] 归档页：`app/{announcements,news,guides,devlog}/page.tsx` 共用归档组件（10/页分页+搜索框）
- [ ] T024 [US3] 文章详情：`app/post/[slug]/page.tsx` — bodyMd 经 lib/markdown 渲染 + TOC 锚点侧栏 + views 客户端水合后 POST 上报 + Wowhead 浮窗（M2 脚本复用）
- [ ] T025 [US3] 静态页：`app/[slug]/page.tsx` 根级兜底（generateStaticParams 预渲染 about/tutorial/agreement/convention/sitemap；未命中 notFound）
- [ ] T026 [US3] 渐进计划页：`app/progression/page.tsx` 时间轴（phaseDate 排序/锚点导航/当前下一阶段高亮/locked 置灰）
- [ ] T027 [US3] 首页重设计：四区块（最新公告 5/服务器状态卡占位[US6 接线]/当前渐进阶段/精选商品——featured 优先回退最新上架）
- [ ] T028 [US3] E2E：`tests/e2e/content.spec.ts` — 归档分页/详情 TOC 跳转+views+1/静态页 5 页可达+随机 slug 404/首页四区块（SC-202 前台半/SC-204）

**Checkpoint（quickstart S3）**: SC-204 渐进时间轴与旧页信息等价；发文可见闭环就绪。

---

## Phase 6: US4 — 内容后台最小集（依赖 Phase 5 查询层与渲染管线）

**目标**: FR-215~217 · SC-206 · quickstart S4。

**Tests（先写先失败）**:

- [ ] T029 [P] [US4] 集成：`tests/integration/admin-content.test.ts` — 文章 CRUD（slug 冲突 422 SLUG_CONFLICT/发布→publishedAt 写入/下稿→置空）、分类删除有引用 422 CATEGORY_IN_USE、页面 slug 命中 RESERVED_SLUGS 422 SLUG_RESERVED、全部越权 401/403+admin_access_violation 回归

**实现**:

- [ ] T030 [US4] `services/content/admin.ts`（文章/页面/分类/标签 CRUD + Zod schemas）+ API 路由 `/api/admin/articles|pages|article-taxonomies`
- [ ] T031 [US4] Markdown 编辑器组件：`components/admin/markdown-editor.tsx`（GFM 工具栏+代码高亮预览+TOC 预览+粘贴图片自动上传 COS→插入 CDN URL，FR-215）
- [ ] T032 [US4] 后台页面组：`/admin/articles`(+new/edit)+`/admin/pages`（requireAdmin 布局既有，导航常量 ADMIN_NAV 扩 5 域）
- [ ] T033 [US4] 媒体库：`services/media/`（上传幂等按 hash 键/列表/删除）+ `/api/admin/media` + `/admin/media` 页面 + 编辑器媒体弹层插入（FR-217；删除二次确认提示死链风险）
- [ ] T034 [US4] E2E：`tests/e2e/admin-content.spec.ts` — 发文闭环（MD 含表格+代码块+图片→前台渲染全对，SC-206）/草稿不可见/越权 403

**Checkpoint（quickstart S4）**: SC-206 闭环达成（后台 Markdown→前台渲染含高亮/图片/TOC；粘贴图落 COS 可访问）。

---

## Phase 7: US5 — 论坛：迁移+只读前台+版主操作（依赖 Phase 2 守卫与 301 骨架）

**目标**: FR-218~220 · SC-201/207 · quickstart S5。

**Tests（先写先失败）**:

- [ ] T035 [P] [US5] 单测：`tests/unit/forum-convert.test.ts` — 状态前缀剥离（【规范】【已解决】【已关闭】→statusLabel+净标题，剥离失败保留原文）、楼层分配（早序 floor 连续、1=主贴）
- [ ] T036 [P] [US5] 集成：`tests/integration/forum-import.test.ts` + `tests/integration/forum-moderation.test.ts` — mini fixture 导入幂等/作者双字段快照（未映射行 authorName 保留）；版主操作：pin/close/label/delete+审计断言、label=closed 直传 422、软删后浏览不可见（SC-207）

**实现**:

- [ ] T037 [US5] `scripts/migrate/forum-import.mjs`：board 5/thread 259/post 722（作者映射+前缀剥离+楼层+附件重写）+ `route-map-m3.sql` 扩 `topic:{id}`/`forum:{id}` 两键；尾部对账（映射率报告）
- [ ] T038 [US5] `services/forum/`（浏览查询 boards/threads/posts + 版主操作 pin/close/label/delete 全审计）
- [ ] T039 [US5] 论坛前台：`app/forum/page.tsx`（版块列表）+ `app/forum/[board]/page.tsx`（主题列表 20/页，pinned desc+lastPostAt desc）+ `app/forum/thread/[id]/page.tsx`（楼层 20/页+状态标签徽标+已关闭态）
- [ ] T040 [US5] 版主 API：`/api/forum/moderate/thread/[id]/{pin,close,label}` + `DELETE`（requireApiModerator，契约照录 api-forum.md）；版主操作按钮内嵌论坛页（moderator 角色服务端渲染可见）
- [ ] T041 [US5] E2E：`tests/e2e/forum.spec.ts` — 游客浏览三层路由+未映射作者快照渲染/user 越权 403+审计/moderator 操作全链路/moderator 访问 /admin 403/`/bbs` 与 `?topic=` 301（SC-201/207）

**Checkpoint（quickstart S5）**: SC-201 论坛半（存量可访问+301 生效）、SC-207 版主越权 0 成功全审计。

---

## Phase 8: US6 — 服务器状态组件（可与其他 US 并行，域独立）

**目标**: FR-221 · SC-208 · quickstart S6。

**Tests（先写先失败）**:

- [ ] T042 [P] [US6] 集成：`tests/integration/server-status.test.ts` — mock 正常态 11 字段契约/降级注入 degraded+缓存保留/冷启动失败数字 null/峰值 max 语义/配置 PUT 后 reloadSystemConfig 即时生效+审计（SC-208）

**实现**:

- [ ] T043 [US6] `services/status/`：探针聚合（SOAP `.server info` 解析+characters 只读统计+Redis 25s 缓存+峰值日键+降级，R7）+ `/api/status`（契约照录 server-status.md）
- [ ] T044 [US6] 状态卡组件：`components/site/status-card.tsx`（两态渲染+30s 轮询+维护模式徽标+数据延迟降级）接线首页区块（US3 占位转正）+ US3 首页状态卡 enable 开关整卡隐藏
- [ ] T045 [US6] 后台配置：`/admin/server-status` 页 + `/api/admin/status-config`（PUT 三键+reloadSystemConfig+审计 status_config_change 前后值）；渐进计划指针失效回退+审计 warn（quickstart S6.5）
- [ ] T046 [US6] E2E：`tests/e2e/server-status.spec.ts` — 状态卡正常渲染/轮询刷新/mock 降级徽标（SC-208 渲染半，注入半已由集成覆盖）

**Checkpoint（quickstart S6）**: SC-208 两态渲染+配置实时生效留痕。

---

## Phase 9: Polish 与收口

- [ ] T047 性能 profile：归档列表/文章详情（MD 管线）//api/status 缓存命中 P95 实测（M2 profile-perf 套路，目标见 plan Performance Goals）
- [ ] T048 静态安全核查：sanitize 白名单覆盖面复核（script/iframe/javascript: 全拦）/审计脱敏（content_*/forum_* 只记 ID 与 slug，不记正文）/审计动作全覆盖核对
- [ ] T049 文档三层同步：AGENTS.md（目录规范 services 新域+测试计数）/README/development-plan（M3 状态流转）+ launch-checklist.md 扩 M3 节（.server info 真机解析核对/characters 今日新注册口径核对/内容迁移正式跑清单）+ specs/003 SC-201~208 核销表 + 飞书池 M3 条目流转
- [ ] T050 Final Checkpoint：`make check` 全绿 + E2E 隔离 schema 全量绿 + S1-S6 checkpoint 逐项复核 + migration-report 定稿

---

## 并行与依赖速览

```text
Phase 1 Setup ──> Phase 2 Foundational ──┬──> Phase 3 US2 迁移(P0) ──> Phase 5 US3 前台 ──> Phase 6 US4 后台
                                         ├──> Phase 4 US1 框架(与 US2 并行) ──┘
                                         ├──> Phase 7 US5 论坛(与 US3/US4 并行,域独立)
                                         └──> Phase 8 US6 状态(域独立,随时可做)
Phase 9 Polish 收口(全量依赖)
```

- MVP 首增量建议：Phase 1+2+3（迁移 P0 落地即 SC-201/202/203 主体）+ Phase 4（壳层），前台/后台/论坛/状态随后
- 单测类任务标 [P]（与同 Phase 集成任务并行编写）；US5/US6 与 US3/US4 文件零交集可全程并行
