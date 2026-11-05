# 代码评审优化清单(2026-11 架构评审)

来源:GitHub issues #65–#89(架构师 codeReview 反馈,2026-11-04/05 提交)。逐条对照当前代码验证,**24 项全部成立并已于 2026-11-05 修复完成**,对应 issue 已关闭。评估快照:2026-11-05(commit b1f8a41 之后)。

> **修复状态**:全部 24 项已按下方 7 个域内聚批次完成代码修复,`make check` 全绿,Vitest 464 例通过;完整 E2E 159/160 通过,剩余 1 例 `admin-role` 登录超时属开发环境偶发闪烁(单独运行可通过)。

## P0 正确性/可靠性(上线前必修)

| Issue | 问题 | 验证结论 | 修复方向 |
|---|---|---|---|
| [#72](https://github.com/domonic18/acore-portal/issues/72) | 商品完整编辑清空促销时间并重置精选 | 成立:编辑页 `initial` 写死 `saleStart/saleEnd: null` 且未装入 `featured`,表单全量 PATCH,持久层 `?? null`/`?? false` 兜底 | 编辑页装入真实三值;或改 PATCH 语义区分「未提交」与「显式清空」;补回归测试 |
| [#65](https://github.com/domonic18/acore-portal/issues/65) | 过期占位回收遗漏游戏账号,同名再注册永久占用 | 成立:`purgeSiteUser` 仅回收站点侧,游戏账号检查在其后,先删站点数据再返回 `username_taken` | 回收前先判游戏账号占用,不可重用时保留站点占位记录(可给出明确失败原因) |
| [#66](https://github.com/domonic18/acore-portal/issues/66) | paid 订单缺少自动交付恢复 | 成立:结账 fire-and-forget 驱动、恢复任务仅扫 `delivering`、补发仅收 `delivery_failed`、启动钩子无恢复;`paid` 可人工退款但无自动恢复 | 启动/定时任务补扫滞留 `paid`;与 #67/#68 同批做发货状态机可靠性改造 |
| [#67](https://github.com/domonic18/acore-portal/issues/67) | SOAP 未知结果换键重发,可能重复发货 | 成立:`nextAttemptKey=count+1` 恒生成新键,同键回放防不住换键重试;超时=结果未知被当确定失败 | 幂等键绑定订单行(稳定业务键,不随 attempt 递增);超时进对账/人工核对,不自动换键重发 |
| [#68](https://github.com/domonic18/acore-portal/issues/68) | delivering 订单无原子领取,多驱动可重复执行 SOAP | 成立:重入跳过状态迁移无互斥,cron 恢复与原驱动/多次恢复可并发,A 插 `:1` 后 B 计数取 `:2` 双真实执行 | 订单(行)级原子 claim:条件更新抢驱动权+租约/fencing,同一逻辑行至多一个驱动者 |
| [#69](https://github.com/domonic18/acore-portal/issues/69) | 恢复主题误恢复此前独立删除的回复 | 成立:删/恢复主题均全楼层批量写 `deletedAt`,无级联来源标记,replyCount 与可见内容失配 | 记录删除来源/级联标识,恢复只还原本次级联删除的楼层;派生计数按真实可见子表重算 |
| [#70](https://github.com/domonic18/acore-portal/issues/70) | 并发删除同一回复重复扣减 replyCount | 成立:删除前读取在事务外,事务内按主键无条件更新+无条件 decrement,可双扣甚至变负 | 事务内 `deletedAt IS NULL` 条件更新,按影响行数决定是否扣减 |

## P1(近期批次)

| Issue | 问题 | 验证结论 | 修复方向 |
|---|---|---|---|
| [#73](https://github.com/domonic18/acore-portal/issues/73) | Banner 新建/更新链接校验不一致 | 成立:新建只收 http(s),更新额外收 `/` 站内路径 | 抽共享 schema,两路统一(空值/站内/外链) |
| [#74](https://github.com/domonic18/acore-portal/issues/74) | 404 统计 TTL 48h 撑不起 7 日看板 | 成立:写入 48h TTL、看板查 7 天,第 3–7 天必缺;键构造在路由与 service 两处重复,路由直写 Redis 越层 | 键构造/写入/读取收口 service;TTL 对齐查询窗口(≥7d) |
| [#75](https://github.com/domonic18/acore-portal/issues/75) | 通知列表非法 limit 生成 NaN 入 Prisma | 成立:`parseInt` 无校验,`Math.min/max` 不修复 NaN,`take: NaN` 触发 Prisma 500 | 路由边界 zod 校验(有限整数+默认/上下限),非法回 400 或回退默认 |
| [#76](https://github.com/domonic18/acore-portal/issues/76) | 论坛上传按请求扣额度,批量绕过 10 张/时 | 成立:每请求扣 1 次,`getAll("files")` 无数量上限 | 按实际张数原子检查扣减;限制单请求文件数;额度不足整批拒绝 |
| [#77](https://github.com/domonic18/acore-portal/issues/77) | 今日峰值 GET/比较/SET 非原子,低值可覆盖高值 | 成立:读旧值后应用内比较再无条件写回,并发探针丢更新 | Redis Lua 原子 max(或单飞探针锁),保留日期切换行为 |
| [#78](https://github.com/domonic18/acore-portal/issues/78) | 后台详情服务泄漏 Prisma 形状,页面做 ORM DTO 适配 | 成立:订单/商品/用户三处详情直返 ORM 结果,页面手工序列化;#72 即发生在此路径 | service 内映射可序列化页面 DTO;页面删适配逻辑;订单列表已有先例可参照 |
| [#79](https://github.com/domonic18/acore-portal/issues/79) | Banner/版块管理器重复排序提交流程且防重入已漂移 | 成立:两处 ~百行同构状态机,banner 侧有 `reordering` 防重入,版块侧无 | 抽共享排序/保存 Hook,保留各自领域 UI;行为对齐(防重入/hydration) |
| [#80](https://github.com/domonic18/acore-portal/issues/80) | 邀请码常量与 API/生成规则漂移 | 成立:长度下限 8/6、maxUses 999/9999、字符集两套(大小写 55 字符 vs 大写 31 字符)三处不一致 | 单一定义(常量文件),路由 schema 与生成 service 复用;表驱动测试对齐 |
| [#81](https://github.com/domonic18/acore-portal/issues/81) | SKU 路由键分散,购物车写死 itemsend 前缀 | 成立(范围收敛):`ITEMSEND_SKU_PREFIX` 常量已存在但 cart 页硬编码字符串;param-schemas/registry 各自解析 | 前缀识别全部改引常量(客户端可引 constants);评估 handler 注册表类型化收口 |
| [#82](https://github.com/domonic18/acore-portal/issues/82) | SOAP 命令/超时重试多真相源 | 成立:两个常量文件各导出 `SOAP_COMMANDS`(数组白名单 vs 仅 SERVER_INFO 的对象),execute 层另存超时/退避,语义已漂移(≤3 vs 共 4 次) | 单一命令注册表(命令+幂等+超时+重试元数据),删旧对象常量,执行层从注册表读 |
| [#83](https://github.com/domonic18/acore-portal/issues/83) | 保留 slug 清单缺现有静态路由 | 成立:`reset-password/banlist/dkp/hardcore/online/online-players/playermap`(及 `uploads`)均未登记,可建同名不可达内容页 | 补全清单+静态路由与清单一致性测试;写路径拒绝保留 slug |
| [#84](https://github.com/domonic18/acore-portal/issues/84) | header-client.tsx 395 行超 350 上限,多职责 | 成立(395 行>350):桌面导航/账户菜单/登出/移动抽屉集中一个客户端组件 | 按职责抽账户菜单/移动导航子组件或 Hook;测试文件超限另列盘点项 |
| [#85](https://github.com/domonic18/acore-portal/issues/85) | 展示组件直接 IO,取数边界不统一 | 成立(分层口径):footer(服务端组件)直呼 `getConfig()` 违反组件无 IO 约定;status-card/unread-badge 为客户端轮询形态(接口即为其设计),改良方向=数据 Hook 与纯展示分离 | footer 改页面/layout 取数传 props;轮询组件抽数据 Hook+纯展示组件 |
| [#86](https://github.com/domonic18/acore-portal/issues/86) | middleware 直读 SESSION_SECRET 绕过统一 env 校验 | 成立:`process.env.SESSION_SECRET` 散点直读,违反宪法 v1.0.2 配置分域收口 | 建 Edge 兼容的统一 env 模块导出校验后 session 配置,middleware 不再直读 |

## P2(随手清)

| Issue | 问题 | 验证结论 | 修复方向 |
|---|---|---|---|
| [#87](https://github.com/domonic18/acore-portal/issues/87) | 状态域常量零引用,键值已漂移 | 成立:status 服务/卡片局部重写键;portrait 实际用 `m3:portrait` 与登记的 `header:random-char` 不一致 | 读写路径全部改引常量并对齐键值;或删失效常量明确唯一真相源 |
| [#88](https://github.com/domonic18/acore-portal/issues/88) | 媒体分类未登记值+局部复写 | 成立:论坛上传写「论坛图片」不在 MEDIA_CATEGORIES(登记的是「论坛配文」,两词已分叉);商品编辑器局部复写「商店配图」 | 中央注册表补全/对齐论坛图片分类,上传与编辑组件改引常量 |
| [#89](https://github.com/domonic18/acore-portal/issues/89) | 订单号前缀/流水类型绕开常量 | 成立:`ORDER_NO_PREFIX="M2"` 与 `POINT_TX_TYPE.SHOP_PAYMENT` 均已存在,checkout/admin 用字面量 | 两处字面量换常量,不引入新抽象 |

## 建议修复批次(域内聚批,降低上下文切换)

1. **发货可靠性**:#66+#67+#68(同一状态机改造:claim/租约+稳定幂等键+paid 恢复)
2. **商城正确性**:#72+#78(同一根因路径:详情 DTO 化后编辑页装真实值)+#73
3. **论坛并发/审核**:#69+#70(软删语义同一张表)+#76
4. **注册回收**:#65
5. **统计/通知/状态**:#74+#75+#77
6. **常量收敛**:#80+#82+#87+#88+#89+#81+#83(机械替换为主,可一个 PR 多项)
7. **前端结构/分层**:#84+#79+#85+#86
