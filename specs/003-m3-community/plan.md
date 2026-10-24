# Implementation Plan: M3 社区 — 论坛 + 内容资讯 + 全局框架完善

**Branch**: `003-m3-community` | **Date**: 2026-10-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-m3-community/spec.md`（Q1-Q7 已裁决归档）

## Summary

交付社区与内容域：①全局框架完善（登录态双菜单/多级菜单照搬旧站/随机角色头图/页脚/移动端响应式框架级+核心页/侧栏 12 组件注册表/Wowhead 文章内浮窗）；②内容域模型与存量迁移（article/content_page/category/tag/views 计数，111+20 存量 HTML→MD 转换迁移，wp_post_views 必迁对账，301 键空间扩容全量生效）；③内容前台（首页四区块聚合/归档分页/详情 TOC+阅读计数/渐进计划 29 档数据化时间轴/静态页 5 核心页）；④内容后台最小集（Markdown 编辑器+CRUD+媒体库简版）；⑤论坛只读（5/259/471 存量迁移 + 前台浏览 + 版主置顶/关闭/删除/标签字段化）；⑥服务器状态组件（SOAP 探针+库统计+人工 3 项，30s 刷新两态渲染）。

技术路线：沿用 M1/M2 单体与依赖方向；业务库新增 Article/ContentPage/ArticleCategory/Tag/ArticleTag/ProgressionNode/ForumBoard/ForumThread/ForumPost/MediaAsset 十表 + Product.featured 扩展 + AuditCategory(content/forum) 扩展；内容单格式 bodyMd（react-markdown 渲染管线+sanitize 白名单，迁移期 turndown 转换）；301 复用 route_map 机制扩键（p/page_id/cat/topic/forum + /bbs 路径级）；版主守卫 requireModerator（moderator/admin，不可进 /admin 后台）；状态探针复用 SOAP 命令层 + Redis 25s 缓存 + system_config 人工项；图片迁移完全复用 M2 image_asset_map + cos-upload 管线。

## Technical Context

> 沿用 M1「规划基线」状态标注：`docs/arch/00` 定稿后升级为「结论」。

**Language/Version**: TypeScript 5（strict）+ Node.js 22 LTS（与 M1/M2 一致）

**Primary Dependencies**: Next.js App Router 单体 · Prisma · node-soap（M1 命令层复用）· ioredis（M1 会话 + M3 状态缓存）· Zod · 腾讯云 COS SDK（M2 复用）· **新增**：react-markdown + remark-gfm + rehype-highlight + rehype-slug + rehype-sanitize（内容渲染管线）· turndown（仅迁移脚本侧 HTML→MD）· Wowhead tooltip 外链脚本（M2 已引入）

**Storage**: MySQL 8.4 ×5 库不变；业务库新增 10 表 + 3 枚举 + 1 枚举扩展 + Product.featured；Redis 新增 3 个非账务缓存键（status:probe / status:peak:{date} / header:random-char）

**Testing**: Vitest（单元/集成）+ Playwright E2E；验收锚点 SC-201（论坛迁移+301）/SC-202（文章迁移+301+死链 0）/SC-203（views 对账+并发）/SC-205（双菜单断言）/SC-207（版主越权 0）为自动化用例

**Target Platform**: 不变（Linux docker compose + caddy；dev compose 含 soap-mock）

**Performance Goals**: 不设硬指标；归档列表 P95 < 500ms；/api/status 探针缓存命中 P95 < 50ms；文章详情渲染（MD 管线）P95 < 300ms

**Constraints**: 游戏库零 DDL（characters 仅 SELECT）· 论坛结构性只读（无写代码路径）· Markdown 渲染必须过 sanitize 白名单（XSS 硬防线）· route_map 全量 ≤500 行缓存模式 · 生产只读铁律不变 · 评论/发帖/传图/区块编辑器/版本历史/审核流明确不做（Q1/Q4 裁决）

**Scale/Scope**: 6,330 用户；6 US / 21 FR / 8 SC；业务库新增 10 表；前台新增约 10 页（首页重设计/4 归档/文章详情/5+ 静态页[slug] 兜底/论坛 3 层/渐进计划）+ 后台 5 域；迁移脚本 3 支（content-import.mjs / forum-import.mjs / route-map-m3.sql）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 门禁问题 | 状态 |
|------|----------|------|
| I 账号一致性三铁律 | M3 是否触碰账号写路径？ | ✅ PASS — 论坛只读、内容后台不涉账号；版主操作仅改论坛数据。账号域零变更（作者映射为只读关联） |
| II 发货必须可靠可见 | 是否影响发货链路？ | ✅ PASS — 不触及；侧栏「最近浏览商品」为纯展示（localStorage），不动订单状态机 |
| III 积分账本可重算 | 是否引入余额变动？ | ✅ PASS — 侧栏积分余额组件只读复用 M2 账本读路径；M3 全程零积分写 |
| IV 兼容与无感迁移 | 旧 URL 是否全量 301？存量内容是否无感迁移？ | ✅ PASS — 核心验收面：`?p=`/`?page_id=`/`?cat=`/`?topic=`/`?forum=`/`/bbs` 全量映射（FR-213/FR-219，SC-201/202）；教程页硬编码旧路径兜住；views 必迁对账（SC-203） |
| V 数据边界与生产只读 | 游戏库是否零 DDL、只读？ | ✅ PASS — characters 仅 SELECT（随机头图抽样/在线统计/角色总数）；SOAP 探针只读命令（.server info）；渐进计划/内容/论坛全走业务库 |
| VI 安全纵深（含配置分域） | UGC 面（存量 HTML）XSS 如何防？版主越权如何防？ | ✅ PASS — MD 管线 rehype-sanitize 白名单（R3）+ 存量 HTML 迁移期 sanitize 落库（纵深双层）；requireModerator 守卫+全操作审计（R5，SC-207）；状态人工配置走 system_config（v1.0.2 分域）；根级 [slug] 保留字清单防路由抢占（R15）；Turnstile deferral 维持 M4 不变（论坛只读故 M3 无 UGC 写入口，deferral 风险面不扩大） |
| VII 单体优先 · YAGNI | 是否引入未论证复杂度？ | ✅ PASS — 新增依赖仅渲染管线 5 包+turndown（内容硬需求）；article_views 独立表裁剪为列（R2）；侧栏配置后台化裁剪为常量（R9）；评论/发帖/区块编辑器/版本历史/审核流全部裁剪（Q1/Q4 裁决） |
| VIII 行为变更必有测试 | 验收锚点是否有自动化用例？ | ✅ PASS — SC-201~208 全部映射 quickstart S1-S6（E2E 迁移对账/301 全量/双菜单断言/版主越权/状态两态注入） |

**Post-design 复检**：Phase 1 完成后维持全 PASS；无新增违例，无需 Complexity Tracking 论证。

## Project Structure

### Documentation (this feature)

```text
specs/003-m3-community/
├── plan.md              # This file
├── research.md          # Phase 0 output（R1-R16 技术决策）
├── data-model.md        # Phase 1 output（10 新表/枚举/配置键/状态机/迁移数据面）
├── quickstart.md        # Phase 1 output（S1-S6 验证场景）
├── contracts/           # Phase 1 output
│   ├── api-content.md   # 前台内容接口（归档/详情/渐进计划/301 映射表）
│   ├── api-forum.md     # 论坛接口（浏览面/版主操作/权限矩阵）
│   ├── api-admin-m3.md  # 后台接口（文章/分类标签/页面/媒体/渐进计划/状态配置）
│   └── server-status.md # 状态探针契约（字段二分/降级/缓存/mock）
└── tasks.md             # Phase 2 output (/speckit-tasks - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
prisma/schema-business/     # 新增 Article/ContentPage/ArticleCategory/Tag/ArticleTag/
                            # ProgressionNode/ForumBoard/ForumThread/ForumPost/MediaAsset
                            # + ContentStatus/ProgressionStatus/ThreadStatusLabel 枚举
                            # + AuditCategory(content/forum) + Product.featured
src/
├── app/
│   ├── page.tsx            # 首页重设计（四区块聚合）
│   ├── post/[slug]/        # 文章详情（TOC/阅读计数/Wowhead）
│   ├── [slug]/             # 静态页根级兜底（5 核心页 generateStaticParams）
│   ├── {announcements,news,guides,devlog}/  # 归档（共用归档组件，10/页分页）
│   ├── progression/        # 渐进计划时间轴
│   ├── forum/              # 版块列表 / [board] 主题列表 / thread/[id] 楼层
│   ├── admin/              # articles(+edit/new)/pages/media/progression/server-status
│   └── api/content|forum|admin/  # Route Handlers 薄层（契约见 contracts/）
├── components/site/        # 站点壳层：header(双菜单+汉堡)/footer/sidebar/{12 组件}/article/
├── server/services/
│   ├── content/            # 文章/页面/分类标签/归档查询/渲染编排
│   ├── progression/        # 节点查询/当前指针解析
│   ├── forum/              # 浏览查询/版主操作（审计）
│   ├── status/             # 探针聚合/缓存/降级
│   ├── media/              # 媒体库（COS 复用 lib/cos）
│   └── home/               # 首页四区块聚合
├── server/session-guard.ts # 新增 requireModerator / requireApiModerator（R5）
├── lib/markdown.ts         # 渲染管线收口（sanitize 白名单/TOC 提取/wowhead 标注）
└── constants/
    ├── navigation.ts       # +SITE_NAV 多级树（authOnly 标记，R12）
    ├── legacy-routes.ts    # 键空间扩容（edge 安全）
    ├── content.ts          # 归档配置/RESERVED_SLUGS/侧栏页面类型映射
    ├── forum.ts            # 状态标签枚举映射
    └── status.ts           # 状态配置键/探针字段
scripts/migrate/            # content-import.mjs / forum-import.mjs / route-map-m3.sql
scripts/dev/                # soap-mock 扩展 .server info 契约
tests/
├── unit/                   # MD 渲染 sanitize/前缀解析/slug 保留字/状态聚合降级
├── integration/            # 迁移导入幂等+对账/views 并发自增/301 全量/版主守卫
└── e2e/                    # 双菜单/归档分页/详情 TOC/论坛浏览/版主操作/状态两态
```

**Structure Decision**: 沿用 M1/M2 单体与依赖方向（`app → server → lib → constants`）；站点壳层组件入 `components/site/`（域组件规范）；论坛版主服务入 `services/forum/`（services 分域，根目录禁平文件）；MD 渲染收口 `lib/markdown.ts` 单文件（渲染是基础设施不是业务，components/server 双侧可引）。

## Complexity Tracking

> 无新增违例。M1 遗留 deferral（Turnstile+登录限速归 M4）继续有效；M3 论坛只读使 M3 期间无 UGC 写入口，deferral 风险面不扩大，M4 公网防滥用清单不变。
