# Research: M3 社区 — 论坛 + 内容资讯 + 全局框架完善

**Feature**: specs/003-m3-community | **Date**: 2026-10-24
**输入**: spec.md FR-201~221（Q1-Q7 已裁决）/ constitution v1.0.2 / docs/research/01 §2（内容/论坛迁移映射）/ 02-功能规格说明书 §2/§7/§8/§12/§13/§14 / 原型 p02/p07/p13/p15

---

## R1 内容存储单格式：bodyMd + 迁移期 HTML→MD 转换（Q2 裁决落地）

**Decision**: article/content_page 统一存 Markdown（`bodyMd LONGTEXT`），单一渲染管线。存量 WP HTML 在迁移脚本内经 turndown 转 MD，转换时同步完成图片 URL 重写（查 image_asset_map）与 Wowhead 短代码规范化。前台一律服务端 RSC 渲染，不落 HTML 中间态。

**Rationale**: Q2 已裁决 DB 内容对象 + 后台可编辑；若同时存 HTML（存量）与 MD（新编）则渲染要双管线、编辑器要双模式，复杂度翻倍。turndown 是成熟 HTML→MD 转换库，一次性迁移转换 + 幂等重跑成本可控；转换瑕疵（复杂表格/嵌套列表）在死链与渲染核对时人工修订。

**Alternatives considered**: ①双格式共存（legacy 存 HTML 原样）——渲染双管线 + XSS 面扩大，弃；②迁移期转 MDX 文件入 git——Q2 已否决（改内容需发版，运营不可自服务）。

## R2 阅读计数：article.views 列原子自增（Q7 裁决落地，article_views 独立表裁剪）

**Decision**: 阅读数落 `article.views Int default 0` 列，详情访问服务端 `UPDATE article SET views = views + 1 WHERE id = ?`（单语句原子，并发无损）。wp_post_views 迁移为初始化 UPDATE（按 legacyWpPostId 关联），对账 SQL 直接列对列比对。不建独立 article_views 表。

**Rationale**: Q7 裁决每次访问 +1（WP 原始口径），无去重维度 → 无需按 IP/会话明细行，独立表只剩"单列计数器"一种内容，属过度建模。单列自增满足 SC-203 两项（对账一致 + 并发无损）；后续若要去重/明细，加明细表再做聚合，不破坏现口径。

**Alternatives considered**: 独立 article_views 表（articleId, views）——与列无本质差异，多一次 JOIN，弃；Redis 计数批量回写——引入丢失窗口，违背"并发下无损"，弃。

## R3 Markdown 渲染管线与安全（XSS 防线）

**Decision**: 统一管线 `react-markdown + remark-gfm + rehype-highlight + rehype-slug + rehype-sanitize`，服务端渲染（RSC 内完成，产物为静态 HTML）。rehype-sanitize 白名单：GFM 全集 + `code[class=language-*]`（高亮）+ `a[data-wowhead]`（R3b）+ `img[src]`（仅 COS CDN 域）。TOC 由渲染产物的 h2-h4 提取（含 rehype-slug 生成的锚点 id），详情页侧栏渲染锚点导航。

**Rationale**: 后台可编辑 + 存量 HTML 转换意味着内容不完全可信（存量文被历史注入的可能性、运营账号被盗的极端面），sanitize 白名单是 XSS 硬防线（宪法 VI）。highlight 代码高亮为 SC-206 验收项。

## R3b Wowhead 文章内提示

**Decision**: 正文内 wowhead 链接（`wowhead.com/item=123` 等四类：item/spell/npc/quest）在渲染层自动加 `data-wowhead` 属性，复用 M2 已引入的官方 tooltip 脚本（static.wowhead.com/widgets）；脚本离线/被墙降级为普通链接（M2 商品页先例）。不新增短代码语法——存量正文里的 `[wowhead]` 类短代码在迁移转换期已规范化为标准链接。

**Rationale**: 迁移期一次性规范化让运行期只剩"链接→浮窗"一条路径；新内容运营直接贴 wowhead 链接即可，零学习成本。

## R4 论坛只读模型与作者快照（Q1 裁决落地）

**Decision**: forum_board/thread/post 三模型；前台零写路径（无发帖/回帖/传图入口，路由层不存在写接口）。存量主题/回复作者做**双字段快照**：`authorUserId`（能按 wp 用户映射到站内 User 时填）+ `authorName VarChar(64)`（迁移期从 wp_posts 冗余快照，未映射用户/已删用户也能显示原始昵称）；头像/资料页链接仅 authorUserId 非空时渲染。楼层号 `floor`（1=主贴）迁移期按 wp 早序分配。

**Rationale**: 6,330 存量用户已全量迁入（M1），预计绝大多数可映射；但 wp_posts 存在已删用户/未关联作者的脏行（论坛类 post_type 历史杂），快照字段保证渲染永不因映射失败缺作者。论坛只读由"无写代码路径"结构性保证，而非开关。

**Alternatives considered**: 强制 authorUserId 非空——脏行迁移阻塞或丢内容，弃；回帖开放给登录用户——Q1 已否决（M4 防滥用屏障前不开放）。

## R5 论坛状态标签字段化与版主守卫（Q3 裁决落地）

**Decision**: thread 建模 `pinned Boolean` + `closedAt DateTime?` + `statusLabel enum(none|standard|resolved|closed)`。版主操作映射：置顶→pinned、关闭→closedAt+statusLabel=closed、删除→`deletedAt` 软删（前台过滤，数据保留）；【规范】/【已解决】由后台下拉设置 statusLabel。存量标题前缀（【规范】xxx 等）迁移期解析剥离进字段。守卫新增 `requireModerator()`（moderator 或 admin，moderator 不可进 /admin 后台——只放开论坛版主面），全部操作写 AuditLog（category=forum）。

**Rationale**: Q3 裁决 M3 字段化；软删保留迁移数据可回溯（SC-207 只要求越权 0 成功+审计，不要求物理删）；标题前缀解析为一次性正则剥离（【规范】【已解决】【已关闭】三种），剥离失败的保留原文不阻塞。

## R6 301 映射扩展：键空间扩容 + /bbs 路径级重定向

**Decision**: 复用 M1 route_map + middleware `/legacy-redirect/[key]` 机制，扩展三处：
1. `LEGACY_KEY_PATTERN` 扩为 `(p|page_id|cat|topic|forum):(\d+)`（edge 安全纯常量，不含路径语义）
2. 迁移脚本按 id 全量写映射：`p:{id}→/post/{slug}`、`page_id:{id}→/{slug}`、`cat:{id}→/{categorySlug}`（公告/资讯/资料梳理/开发日志归档）、`topic:{id}→/forum/thread/{id}`、`forum:{id}→/forum/{boardSlug}`
3. `/bbs` 与 `/bbs/*` 路径级 301 在 middleware 直接写死到 `/forum`（旧站固定入口，无需查库）

**Rationale**: route_map 全量 ≤500 行（M1 缓存注释按 ≤200 估算，M3 后上调）进程内缓存模式已验证；id 级映射表是 SC-201/202"全部生效"断言的直接对账面。middleware 已有 query 规范化骨架，只扩键不换机制。

**Alternatives considered**: 逐条 next.config redirects——131+301+259+5 条硬编码进配置，改映射要发版，弃（route_map 可后台维护）。

## R7 服务器状态探针：SOAP 文本解析 + characters 统计 + Redis 缓存（Q6 裁决落地）

**Decision**: `/api/status` 聚合三源：
1. **SOAP 探针**（worldserver `.server info`）：运行状态（命令可达=online）、稳定运行（uptime 解析）、登录队列（输出行解析，解析失败置 null 前台显示 N/A）、在线数（以 characters 库 `online=1` 计数为准，比文本解析可靠）
2. **characters 库只读统计**：在线数/阵营比（online=1 按 race 联盟/部落聚合）、角色总数、今日新注册（ characters.created_at? 按项目既有注册时间字段口径，M1 迁移已有）
3. **人工配置**（system_config）：`status.maintenance_mode` / `status.enabled` / `progression.current_node_id`（当前阶段指到 progression_node）

缓存：Redis `status:probe` 缓存探针聚合结果 TTL 25s（前台 30s 轮询不穿透打 SOAP）；`status:peak:{yyyyMMdd}` 今日峰值在每次探针成功时 `max` 更新，TTL 48h。探针失败/超时（2s）→ 返回 degraded 态，前台渲染「数据延迟」徽标，全部字段保留上次缓存值+延迟标注。

**Rationale**: Q6 裁决一步到位；SOAP `.server info` 是 AzerothCore 标准命令，mock 先行固化解析契约，真机核对入 launch-checklist（M2 同款节奏）；在线数走库不走文本解析是可靠性取舍（文本格式跨版本漂移）。

**Alternatives considered**: 每 30s 直打 SOAP 无缓存——多访客放大 SOAP 压力，弃；峰值入库 MySQL——日粒度数据进 Redis 日键足够，丢峰值可接受（非账务数据），弃。

## R8 渐进计划数据化与当前阶段指针

**Decision**: progression_node 表（29 档迁移），`phaseDate Date` 显式日期排序；开放状态 `status enum(locked|open)`；前台时间轴 `#node-{id}` 锚点导航；**当前阶段** = system_config `progression.current_node_id` 人工配置（US6 三人工项之一），**下一阶段** = 时间轴上当前节点之后第一个节点（推导，不配置）。首页"当前渐进阶段"卡与状态卡读同一指针。

**Rationale**: p15 字段二分定案"接口拿不到的人工管"——当前阶段是运营语义（内测/公测/开放），机器无法从日期推导（跳票/提前开阶段常见），人工指针最符合；下一阶段是纯序数推导无需人工。

## R9 侧栏组件注册表与页面类型配置

**Decision**: `components/site/sidebar/` 下每组件一文件，注册表 `SIDEBAR_COMPONENTS: Record<key, Component>`；页面类型→组件清单映射放 `constants/content.ts`（如 `archive: [search, announcement-banners, client-download, ...]`），M3 不做后台可视化配置（改清单=改常量，发版可接受，FR-206 只要求"可按页面类型配置"）。积分余额组件登录态才渲染（服务端 session 判断）；最近浏览商品读 localStorage（纯客户端，M2 商品浏览埋点写入）。

**Rationale**: 12 组件清单是旧站静态事实，后台化配置是伪需求（改版频率=年级别）；注册表+常量映射是零成本满足 FR-206 的最小实现。最近浏览无需服务端存储（跨设备同步是伪需求）。

## R10 随机角色头图：characters 只读抽样 + 静态头像映射

**Decision**: 页头每次刷新随机展示魔兽角色头图。抽样：acore_characters.characters 只读 `ORDER BY RAND() LIMIT 1`（加 `level>0` 基础过滤；6K 行全表扫成本可接受，页头非高频热点）；展示：race+class+gender 三元组映射到 `public/portraits/` 静态头像集（60 级客户端全组合枚举，构建期脚本生成映射常量）。查询失败/超时（500ms）→ 默认头图降级（FR-203）。短 TTL（60s）Redis 缓存平滑突发。

**Rationale**: 头像图源是客户端静态资源（race-class-gender 组合有限可枚举），无需角色截图存 COS；生产只读铁律下纯 SELECT 安全；降级路径保证页头永不空图。

**Alternatives considered**: 从角色截图 COS 抽样——存量无此资产，需游戏内截图工程，弃；RAND() 换 id 随机区间——优化收益在 6K 规模不可感，KISS 弃。

## R11 图片迁移完全复用 M2 管线

**Decision**: 正文/论坛附件/渐进计划配图的存量图片统一走 M2 `image_asset_map + cos-upload.mjs` 幂等管线：先跑 cos-upload 扫描 uploads 目录（M2 已覆盖全量 4.4G/972 附件，M3 增量核对即可），内容迁移转换（R1）与论坛附件重写（R4）查同一映射表；死链扫描脚本复用 M2 版本扩展扫描面（article.bodyMd / forum_post.contentHtml / progression_node.imageUrl / content_page.bodyMd）。

**Rationale**: spec Assumptions 明确"不新建机制"；M2 管线已验证幂等/映射/扫描三件套，唯一新工作是扫描面清单扩充。

## R12 双菜单导航与移动端折叠（Q5 裁决落地）

**Decision**: `constants/navigation.ts` 新增 `SITE_NAV`（多级树结构：首页｜项目简介｜使用教程｜公告▾｜数据库▾｜资讯｜论坛｜积分商店｜我的帐户▾），节点带 `authOnly` 标记；页头按 session.role 渲染：游客版隐藏我的帐户▾、商店/账户点击跳登录引导（FR-201）；登录版完整渲染。多级菜单数据一次随 RSC 布局下发，客户端组件只管交互（下拉/汉堡折叠）。响应式范围（Q5 裁决）：框架级（页头/导航/页脚/布局容器）+ 核心页（首页/商城/账户/文章/论坛），长尾后台页桌面优先。

**Rationale**: 菜单结构照搬旧站是规格硬要求（SC-205 逐项断言），常量树是断言的直接数据面；authOnly 标记让"双菜单"成为同一数据源的过滤产物（断言互斥即可验证），避免两份菜单漂移。

## R13 媒体库最小集

**Decision**: 新表 `media_asset`（cosKey/url/originalName/sizeBytes/mimeType/uploadedBy），上传复用 `lib/cos`；后台 /admin/media 列表（分页+文件名搜索）+ 上传（多选）+ 删除（仅删映射行+COS 对象，不追踪正文引用——删除前提示"可能造成正文死链"二次确认）；编辑器插入：媒体库弹层选中→插入 Markdown 图片语法。

**Rationale**: FR-217 边界明确（列表/上传/删除/插入）；引用追踪（删除校验全表 LIKE）在大文本列上昂贵且误报多，运营自律+二次确认够用（内网运营工具语境）；文件夹管理已裁剪（Q4）。

## R14 首页聚合与精选商品

**Decision**: 首页四区块：①最新公告（article 按 announcements 分类取 5 条）②服务器状态卡（/api/status 同源数据服务端首渲染）③当前渐进阶段卡（指针节点标题+日期+链接）④精选商品。精选 = Product 新增 `featured Boolean default false` + 后台商品表单开关，首页取 `featured && published` 按 sort 最新 4 件，无精选时回退最新上架 4 件（空态安全）。

**Rationale**: 精选是运营策展语义，日期序无法表达"主推限量坐骑"；一个布尔字段 + 表单开关成本最低；回退逻辑保证上线初期无精选也不空块。

## R15 静态页路由：根级 [slug] 动态段兜底

**Decision**: content_page 走根级 `app/[slug]/page.tsx` 动态段（App Router 静态路由优先于动态段，天然无冲突）：`generateStaticParams` 预渲染 5 个核心页（about/tutorial/agreement/convention/sitemap——项目简介/使用教程/用户协议/和谐公约/网站地图），其余 15 页请求时渲染；未命中 content_page → notFound()。后台保存 slug 时校验保留字清单（`constants/content.ts` RESERVED_SLUGS：shop/cart/checkout/account/admin/forum/api/login/post/news/announcements/guides/devlog/progression 等）。

**Rationale**: 20 页逐页建静态路由违背 DRY；根级 [slug] 是 App Router 原生模式（静态段自动优先），保留字清单防业务路由被内容页抢占（安全纵深：内容运营不能"创建"一个 /admin）。

## R16 迁移管线与对账面

**Decision**: `scripts/migrate/` 新增（沿用 M1/M2 SQL INSERT SELECT + 临时库套路，全部幂等）：
- `content-import.mjs`：Node 脚本（turndown 转换在 JS 侧，SQL 不擅长大文本转换）：wp_posts(post)→article（bodyMd 转换+图片重写+views 初始化）、wp_posts(page)→content_page、wp_terms→article_category/tag、wp_post_views→article.views、渐进计划 29 档→progression_node
- `forum-import.mjs`：wp_posts(forum/topic/reply)→forum_board/thread/post（作者映射+前缀解析+楼层分配+附件重写）
- `route-map-m3.sql`：p/page_id/cat/topic/forum 五键空间全量映射写入
- 对账 SQL（幂等重跑零新增 + 计数对账 + views 对账 + 301 全量抽查清单）内嵌脚本尾部断言

**Rationale**: HTML→MD 必须在 Node 侧（turndown），SQL 只做结构映射；M1/M2 已验证"Node 编排 + 参数化 SQL/Prisma 批量"混合模式；对账内嵌保证脚本自身即验收工具（M2 migration-report 同款）。
