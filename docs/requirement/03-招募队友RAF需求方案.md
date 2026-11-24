# 招募队友（RAF）需求方案设计

> 里程碑:二期 N1「招募队友」(见 `docs/plan/development-plan.md` N1 条目)
> 文档性质:**需求与设计基准**。写法以 **git 仓库代码事实**与 **AzerothCore 代码事实**为准,规划文档只作参考。
> 状态:**已核对定稿(第 5 版)**｜编写日期:2026-11-20｜核对结论:维护方认可整体方向,并拍板「奖励取消积分」「发奖走门户统一发货」「**采纳方案 B(游戏端零改动)**,游戏时长用**角色**的游戏时长」「达成条件 = 等级 + 游戏时长 + 成就,且要可扩展、不能写死」
> 第 5 版相对第 4 版的改动(**结构性简化**,围绕「取消共享库」与「条件模型重构」):
> ① **取消游戏侧 `acore_eluna` 共享库**,RAF 数据全部落**门户业务库**;游戏侧只做**只读数据源** ⇒ 跨库写路径、库级授权、DBA 前置、游戏端排期**全部消失**;
> ② **条件模型重构**——门槛不再写死在规则表的几个列上,而是拆成「活动规则 + 条件行 + 条件事实」三层,条件类型走**注册表** ⇒ 新增条件类型是**加一个评估器**,不是改表结构;
> ③ **游戏时长改用角色级 `characters.totaltime`**(维护方拍板),不再用账号级 `account.totaltime`;
> ④ **归因两段式的第二段改由门户执行**(门户读游戏库把预登记转成招募关系),游戏端不再承担归因;
> ⑤ 里程碑由 `N1-0…N1-e` 改为 `N1-a…N1-e`(**去掉 N1-0 共享库就位、N1-c 游戏端脚本**),全链**无外部前置**;
> ⑥ 补记**零元发货单的四项必做与一项必避**(写 `paidAt` / 跳过扣积分流水 / 写 `params.characterGuid` / 统计按 `source` 过滤 / 奖励须用**专用隐藏商品**否则占用用户限购额度)。
>
> 第 4 版相对第 3 版的改动:① 奖励**取消积分**(积分是站点赞助收入)⇒ 改为游戏内**拾取绑定、不可交易**的物品,阶梯为「容器背包 → 变装/幻化外观 → 坐骑」;② **发奖统一走门户发货链路**(门户出零元发货单走既有 SOAP 发货驱动);③ 防作弊升级为**组合闸**:新号冷静期 3 天 + **观察期延迟发奖** + 游戏内在线时长门槛 + 人工复核队列 + 阶梯递减 + 每人每活动封顶,信号类**只打标不拦**;④ 连带不新增 `PointTxType` 枚举值、不动 `point_rule`。
> 第 3 版相对第 2 版的改动:① 规则改为**唯一一张表**;② 去掉邀请码副本;③ 归因改两段式;④ 补录入口改门户页自助。
>
> 相关:规格书 §3.4「用户中心 · RAF 招募进度」、AGENTS.md 规则 1(站号=游戏账号)/ 5(游戏四库只读)/ 38(可选依赖语义)/ 31(时间口径)/ 3(发货可靠可见)/ 35①(能力投影复用同一入口)

---

## 1. 背景与目标

老站(WordPress)有「招募队友(RAF)」玩法:玩家拿到专属链接,拉新玩家注册建号即建立招募关系,
被招募角色达到条件后双方获奖赏。M1 已在门户搭好页面骨架与 API 骨架,但**数据接口始终是空态硬编码**。

N1 目标(沿用 development-plan N1 验收标准):

1. RAF 页展示**真实招募数据**,不再是硬编码零值;
2. **角色维度隔离**——只展示当前所选角色的招募进度;
3. 游戏端数据不可用时**明确空态而非报错**;
4. 依赖的游戏库缺失**不拖垮门户**(降级而非启动自检失败)。

四条经核对确认的设计底线,贯穿全文:

- **规则唯一真相源**——活动规则与达标条件在物理上只有一套表,门户写、门户读,**不存在「真身+副本」**;
- **条件可扩展、不能写死**——门槛以「条件行」表达,条件类型走**注册表**;参数扩展后台可配(免发版),新增类型只需加评估器(不发版不建表);
- **游戏侧零改动**——不要求游戏端写库、不要求游戏端发版、不依赖游戏端排期;游戏侧只作为**只读事实来源**;
- **改动可追踪**——规则变更留版本快照 + 审计,可查历史、可回滚。

---

## 2. 已拍板的决策(2026-11-20 核对结论)

| # | 决策 | 影响 |
| --- | --- | --- |
| **C1** | **采纳方案 B:游戏端零改动**——RAF 规则、条件、事实、关系、台账**全部落门户业务库**;游戏侧只提供只读事实(等级/时长/成就/任务) | 取消共享库、取消跨库写、取消 DBA 前置、取消游戏端排期 |
| **C2** | **归因两段式**:注册带码**预登记** → 门户读游戏库**转正**成招募关系 | 游戏端不参与归因;转正须有真实角色(防作弊) |
| **C3** | **游戏内要有奖励**:奖励全部是**游戏内物品**(容器背包 → 变装/幻化外观 → 坐骑,逐层递进) | 奖励 = 商城商品的投影,复用既有 SKU 与发货处理器 |
| **C4** | **双方都拿**奖励(招募人 + 被招募人各一份,阶梯不同) | 招募人侧门槛更高(招满 N 人 + 自身条件),被招募人侧门槛更低 |
| **C5** | **邀请码合并成一套**:RAF 专属链接携带的就是门户既有邀请码;玩家可自助领取专属码 | 邀请码表扩展「归属用户/角色」;**码只存在业务库** |
| **C6** | 活动规则与条件**唯一一份**,门户后台可视改 + 审计留痕 + 版本可回溯 | 无副本、无同步链路;改参数秒级生效 |
| **C7** | 绑定采用**两段式**:注册带码预登记 → 建号进游戏后转正 | 体验接近「注册即归因」,防作弊保留「须有真实角色」 |
| **C8** | 奖励解锁条件 = **等级 + 游戏时长 + 成就**(+ 任务等),**且可扩展** | 条件走**类型注册表 + 条件行表**,新增类型=加评估器 |
| **C9** | **游戏时长用角色级 `characters.totaltime`**(维护方拍板) | 不用账号级 `account.totaltime`;时长按「该角色累计在线分钟」判 |
| **C10** | **奖励不用积分**(积分是站点赞助收入,赠送会削弱赞助) | 奖励 = 游戏内**拾取绑定、不可交易**物品;**不新增** `PointTxType`、**不动** `point_rule`、**不写**积分流水 |
| **C11** | **发奖统一走门户发货链路**:门户零元发货(不扣积分) | 复用订单状态机 + SOAP + 重试 + 飞书告警 + 人工补发(宪法 III) |
| **C12** | 防作弊闸门组合:**新号冷静期 3 天 + 观察期延迟发奖 + 在线时长门槛 + 人工复核队列 + 阶梯递减 + 每人每活动封顶** | 入口不拦人,**在发奖口拦人**;信号类(同 IP/同 C 段/邀请图谱星型)**只打标不拦** |
| **C13** | **条件事实按 executor 单一写者**:每个条件行只配一个 `executor`(`portal` / `game`),事实只由该写者产生 | 写集不相交 ⇒ 不会出现「谁覆盖谁」;`executor='game'` 是**未来扩展位**,本期不启用 |
| **C14** | **零元发货单四必做一必避**:写 `paidAt` / 跳过扣积分流水 / 写 `params.characterGuid` / 统计按 `source` 过滤;奖励商品**必须是专用隐藏商品**(否则占用用户对该商品的限购额度) | 见 §6.3 与 §5.5 |

---

## 3. 现状(代码事实)

### 3.1 门户侧已就位的骨架

| 位置 | 事实 |
| --- | --- |
| `src/app/(account)/account/raf/page.tsx` | M1 静态页:「已招募 0 人」硬编码 + 玩法说明三行 |
| `src/app/api/account/raf/route.ts` | M1 桩:`apiOk({ recruited: [], total: 0 })` |
| `src/constants/navigation.ts` | `ACCOUNT_NAV` 已含「RAF 招募」入口 |
| `prisma/schema-characters/schema.prisma` | `Characters` 模型**当前没有 `totaltime` 字段**(AC 真表有,见 §3.2)⇒ 需扩读模型 |
| `prisma/schema-characters/schema.prisma` | **没有 `CharacterAchievement` 模型**(AC 真表有)⇒ 需扩读模型 |
| `prisma/schema-auth/schema.prisma` | `Account` → `account`,`username @unique`(库中存**大写**),`totaltime` |
| `src/lib/db/auth.ts` | `createAccount` / `updateAccountCredential` / `findByUsername`(用户名**统一大写**后匹配) |
| `src/server/services/shared/game-identity.ts` | `resolveGameAccountId`(**站点用户 → 游戏账号 id**,正向)/ `listOwnCharacters` / `characterOwnedBy` / `listCharacterNamesByGuids` / `GameDbError` |
| `src/server/services/shared/site-identity.ts` | `getSiteUsername(userId)`(正向);**无「游戏账号 → 站点用户」反查**——v5 不需要(关系行直接存站点用户 id) |
| `src/server/services/account/restore-items.ts` | 归属校验 + 越权审计(`OWNERSHIP_VIOLATION`)先例 |
| `src/app/(account)/account/characters/page.tsx` | `GameDbError` → 琥珀色错误面板先例 |
| `prisma/schema-business/schema.prisma` | 业务库已有 `invitation_code` / `invitation_code_use`(`@@unique([codeId,userId])`)/ `point_rule` / `point_transaction`(`PointTxType` 是 **MySQL enum**)/ `badge_grant`(`@@unique([badgeId,userId])` = **幂等台账先例**) |
| `src/server/services/shared/ledger.ts` | `creditLedger` / `debitLedger`;`point_transaction` **无 `(refType,refId)` 唯一约束** ⇒ 幂等不能靠流水,须另建台账 |
| `src/constants/soap.ts` + `src/server/services/shop/handlers/` | SOAP 命令含 `SEND_ITEMS` / `TRANSMOG_ADD` / `CHARACTER_CUSTOMIZE` 等;**无 SendGold ⇒ 门户发不了金币**;物品/幻化/改名等均有现成发货处理器 ⇒ 奖励物品类发货**无需新增 SOAP 命令** |
| `prisma/schema-business/schema.prisma`(`Order` / `OrderItem`) | `OrderItem.productId` **必填** ⇒ 零元奖励单也须挂一个商城商品;`Order` 有 `pointCost` / `status` / `deliveryClaimUntil` ⇒ 零元单(`pointCost=0`)可复用同一状态机与重试 |
| `src/server/services/shop/checkout.ts:195-220` | **全站唯一建单处**:扣积分(`debitLedger`)→ 建单(`status=PAID` + `paidAt=now`)→ 建 `order_item`(含 `params`) |
| `src/server/services/shop/delivery.ts:190-206` | 恢复扫描捞单条件:`status=delivering` 且停滞 或 `status=paid` 且 `paidAt < now-2min` ⇒ **`paidAt` 必须写**,否则永远捞不到 |
| `src/server/services/catalog/purchase-limit.ts:16-21` | `ITEM_OCCUPIED_STATUSES` 含 `COMPLETED` ⇒ 奖励单会**占用用户对该商品的限购额度** ⇒ 奖励须用**专用隐藏商品** |
| `src/server/services/stats/sales.ts:44-62` | 销售榜按 `order_item` 聚合,**无 `source` 过滤** ⇒ 零元奖励单会**灌进热销榜 sold_qty** |
| `src/app/api/auth/register/route.ts:16-18,22` | 「M1 注册不要求邀请码,`invitation_code` 兼容接收但忽略」;注册接口 `registerAccount` **无邀请码字段** |
| `src/server/services/auth/register.ts:32-36,167-171` | 跨库写无原子性(SC-004):站点事务(占位用户+令牌+邮件)后调 `authDb.createAccount`,失败走 `purgeSiteUser` 补偿 |
| `src/constants/invitation.ts` | 邀请码状态机 `available/disabled/finish` + `expired` 实时推导不落库;`INVITATION_ALIMITS` 码值形态与随机字符集 |

### 3.2 AzerothCore 侧事实(源码核对,路径相对 AC 仓库根)

> 只读核对,结论以源码为准。

| 事实 | 位置 | 用途 |
| --- | --- | --- |
| `characters.totaltime` INT UNSIGNED(**秒**) | `data/sql/base/db_characters/characters.sql:51` | **角色级在线时长**(C9) |
| `characters.account` INT UNSIGNED + `KEY idx_account` | 同上 `characters.sql` + `:105` | 账号 → 角色列表(转正时定位被招募角色) |
| `characters.level` TINYINT UNSIGNED | 同上 | 等级条件 |
| `character_achievement(guid, achievement, date)` | `data/sql/base/db_characters/character_achievement.sql` | **成就条件**;`date` 是 unix 秒 ⇒ 成就达成时刻可精确到秒 |
| `character_achievement_progress(guid, criteria, counter, date)` | `character_achievement_progress.sql` | 成就**计数型**准则(如「击杀 N 个」) |
| `character_queststatus(guid, quest, status, explored, ...)` | `character_queststatus.sql` | 任务完成条件(`status` ∈ {3 completed, 4 rewarded}) |
| `account.totaltime` INT UNSIGNED(秒) | `data/sql/base/db_auth/account.sql` | **账号级时长**——本方案**不用**(C9) |
| `account.username` 存**大写** + `UNIQUE KEY idx_username` | 同上 | 反查/匹配时的口径 |
| 成就与任务**中文名不在数据库** | 成就来自 DBC(`mod-custom-content` 已定制 `mcc_achievement_dbc.sql`) | 条件行里的名称**由运营填写备注**,门户无权威中文名来源 |

### 3.3 生产实况(2026-11-20 只读核实)

| 事实 | 影响 |
| --- | --- |
| 游戏侧 MySQL 主机只有 `acore_auth` / `acore_characters` / `acore_world` | 门户**只读**这三个库即可支撑全部本期条件(等级/时长/成就/任务) |
| `acore_characters.character_social` 是 AC 标准好友表 | **不是**招募关系表,不可拿它当 RAF 数据源 |
| 门户生产 MySQL 里已存在 `acore_eluna` 库但**一张表都没有**;生产 `gamedb.eluna` 指向门户自身 MySQL 容器内该空库 | v5 **不再使用 eluna** ⇒ 本项不影响 N1;该配置项当前**零业务用途**,可另开清理项 |

---

## 4. 参与方与职责边界(方案 B)

```
┌──────────────── 门户(Next.js,单体)────────────────┐
│ 业务库(唯一真相源)                                  │
│  · raf_activity_rule        活动规则(单行有效)       │
│  · raf_activity_rule_version 规则版本快照            │
│  · raf_rule_condition       条件行(可扩展门槛)        │
│  · raf_condition_fact       达标事实(门户评估器写)    │
│  · raf_referral_pending     注册预登记               │
│  · raf_recruit              招募关系                 │
│  · raf_reward_tier          奖励档位                 │
│  · raf_reward_grant         发奖台账(幂等+观察期)      │
│  · shop_order(source=raf_reward) 零元发货单           │
└───────────────┬──────────────────────────┬───────────┘
                │ 只读                      │ 只读
        characters 库(等级/时长/成就/任务)   auth 库(账号↔角色)
                ▲                          ▲
                └──────── 游戏端(仅提供事实,零改动) ────────┘
```

**职责边界表**

| 事项 | 门户 | 游戏端 |
| --- | --- | --- |
| 活动规则与条件(**唯一一份**) | ✅ 写 + 后台改 + 审计 + 版本 + 回滚 | — |
| 条件类型注册表 | ✅ 定义评估器 | — |
| 达标判定 | ✅ 求值并落事实 | — |
| 邀请码 | ✅ 生成/禁用/自助领码/登记时校验 | — |
| 注册预登记 → 转正 | ✅ 全程 | — |
| 招募关系 | ✅ 建/读 | — |
| 角色等级 / 在线时长 / 成就 / 任务 | ✅ **只读** | 提供事实(不改代码) |
| 奖励内容配置 | ✅ 后台配档位与物品 | **完全不知道奖励是什么** |
| 奖励发放 | ✅ 零元发货单 → SOAP 发货 | **不发奖** |
| 发奖闸门(冷静期/观察期/复核) | ✅ 判定 | — |
| 进度展示 | ✅ | — |

**一句话边界**

> **门户自治:RAF 的一切「状态」都在门户业务库;游戏侧只提供「事实读数」。**
> 游戏端**不改一行代码、不建一张表、不写一次库**——门户按条件类型各自去游戏库取数。

**代价(必须承认)**

1. **达标时刻精度**——等级/时长类条件只在**门户观察到的时刻**才可知(≤ 一个扫描周期),不像成就那样能从 `character_achievement.date` 取到精确达成时刻。
   ⇒ 缓解:观察期本身就覆盖了「延迟发现」的时间窗,不影响公平性。
2. **`totaltime` 含挂机时长**——脚本可以拉时长,但**拉不满真实时长成本**;纯挂机仍可拉满。
   ⇒ 缓解:组合闸(冷静期 + 观察期 + 复核 + 只打标)承担剩余风险;不追求「防住挂机」,追求「成本与收益不成正比」。
3. **门户依赖游戏库可达**——游戏库不可达时 RAF 页降级(不报错、不发奖)。
4. **读模型须跟随 AC 升级**——AC 改列名/改表时,门户的 `schema-characters` 读模型要跟着改(本期只加 `totaltime` 与 `CharacterAchievement`)。

---

## 5. 数据契约

> 全部落**门户业务库**(Prisma 迁移是唯一真相源,业务库表用 snake_case)。
> 本方案**不涉及**游戏侧建表、不涉及跨库写。

### 5.1 活动规则(单行有效)

```prisma
model RafActivityRule {
  id                Int       @id @default(autoincrement())
  targetCount      Int       @default(3)      // 目标招募人数(招满奖门槛)
  recruiterMinLevel Int     @default(30)     // 招募人领取「招满」奖的等级门槛
  accountAgeDays   Int       @default(3)      // 新号冷静期(天):账号注册满 N 天才计入
  observeDays      Int       @default(7)      // 观察期(天):达标后等 N 天无异常才发
  status           String    @default("draft") // draft | active | closed
  startAt          DateTime
  endAt            DateTime
  ruleVersion      Int       @default(1)      // 每次保存 +1,发放记录回引
  updatedAt        DateTime  @updatedAt
  updatedBy        BigInt?

  @@map("raf_activity_rule")
}
```

> **活动级参数与「达标条件」分家**:活动级只放「与角色无关的」参数(目标人数、招募人门槛、时间窗、冷静期、观察期);
> 「被招募人要达到什么」全部走 `raf_rule_condition` ⇒ 条件是**可增删的行**,不是**固定的列**。
> 规则数值**不得进 `src/constants/`**(改了要发版且 git 里零散难追)。

### 5.2 条件三层:条件行 / 条件类型注册表 / 条件事实

**① 条件行** `raf_rule_condition`——门槛以行表达,新增门槛 = 加一行(后台可配,免发版)

```prisma
model RafRuleCondition {
  id         BigInt  @id @default(autoincrement())
  condType   String  // 条件类型键,如 char_level / char_playtime / achievement / quest_completed
  params     Json    // 类型专属参数,如 { "achievementId": 1234 }
  threshold  Int?    // 数值门槛(等级 10 / 分钟 300);无阈值类型为 null
  required   Boolean @default(true)  // true=必达(AND),false=加分项(不计达标)
  enabled    Boolean @default(true)
  executor   String  @default("portal") // portal | game(C13:单一写者)
  sort       Int     @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@map("raf_rule_condition")
}
```

> 达标判定 = **所有 `required=true` 且 `enabled=true` 的条件行都产出事实** ⇒ AND 语义。
> `executor` 是**写者归属**:同一条件行的事实只可能由一个执行器产生 ⇒ 写集不相交(C13)。

**② 条件类型注册表**(代码侧 `src/server/services/raf/conditions/`,每类型一个评估器)

| cond_type | executor | 数据来源(只读) | 判定 | `params` | `threshold` |
| --- | --- | --- | --- | --- | --- |
| `char_level` | portal | `characters.level` | `level ≥ threshold` | — | 等级 |
| `char_playtime` | portal | `characters.totaltime`(秒) | `totaltime / 60 ≥ threshold`(分钟) | — | 分钟 |
| `achievement` | portal | `character_achievement` | 存在 `(guid, achievement)` 行 ⇒ 达成;`achieved_at` 取 `date`(**精确到秒**) | `{ achievementId }` | — |
| `achievement_criteria` | portal | `character_achievement_progress` | `counter ≥ threshold` | `{ criteriaId }` | 计数 |
| `quest_completed` | portal | `character_queststatus` | 存在 `status IN (3,4)` 的行 | `{ questId }` | — |
| `game_fact`（预留） | game | 游戏侧契约表 | 由游戏端评估并写事实,门户只读 | `{ factKey }` | — |

> **扩展性的两个层次(维护方关注点)**:
> - **参数扩展**(改门槛值、新增一条同类型条件)⇒ **后台可配,不发版**;
> - **新类型扩展**(例如「完成任务数」「副本首通」「赛季排名」)⇒ **加一个评估器 + 注册表一条**,不改表结构、不改既有条件行。
>   新类型若数据在游戏库有现成表 ⇒ 仍是 `executor=portal`;若数据只有游戏端知道 ⇒ 走 `executor=game`(见 ③)。
>
> **成就/任务的中文名**:成就与任务的权威名在 DBC/服务端文件里,门户无权威来源 ⇒ 条件行的名称由**运营填写备注**,后台列表展示备注名。

**③ 条件事实** `raf_condition_fact`——「某角色达成了某条件」的快照,写一次不再改

```prisma
model RafConditionFact {
  id         BigInt   @id @default(autoincrement())
  conditionId BigInt
  guid       Int      // 角色 guid
  achievedAt DateTime // 达成时刻(UTC);成就类取游戏库真实 date,其余取观察时刻
  executor   String   // portal | game
  createdAt  DateTime @default(now())

  @@unique([conditionId, guid])
  @@map("raf_condition_fact")
}
```

> 唯一键 `(condition_id, guid)` ⇒ **同一角色同一条件只可能有一条事实** ⇒ 判定幂等,反复扫描不重复产生。
> `executor='game'` 时,事实由游戏端写入 **AC characters 库同名契约表**(`raf_condition_fact`,列同构),
> 门户只读该表 ⇒ 门户读侧始终只有两张事实表(业务库 + AC characters 库),
> **不需要通用读表器**(避免「按表名动态拼 SQL」这种不可审计的口子)。**本期不启用 `game` 执行器**。

### 5.3 邀请码扩展(既有 `invitation_code` 加列)

| 新增列 | 含义 |
| --- | --- |
| `owner_user_id` BIGINT NULL | 归属站点用户(玩家自助领码时写入;后台批量生成的通用码为 NULL) |
| `owner_guid` INT NULL | 归属角色 guid(玩家自助领码时写入) |
| `raf_scope` TINYINT(1) | 是否 RAF 专属码(1=是;0=普通邀请码,不参与游戏内绑定) |

既有 `max_uses` / `expires_at` / `status` / `used_count` **沿用不改语义**;专属码同样受次数与过期约束(次数在**登记时**由门户扣减)。
> 现状提醒:`used_count` 当前**从未维护**、`invitation_code_use` 当前**从未写入** ⇒ `@@unique([codeId,userId])` 并**不能**保证「一码一账号」,
> 本方案在 `raf_recruit` 上另设 `uk_recruit_account` 承担该约束(见 §5.5)。

### 5.4 归因两张表(门户写)

**① `raf_referral_pending`**——注册预登记(两段式第一段)

```prisma
model RafReferralPending {
  id          BigInt   @id @default(autoincrement())
  codeId      BigInt   // 邀请码 id(业务库)
  siteUserId  BigInt   // 被邀请人站点用户 id
  gameAccountId Int?   // 游戏账号 id(注册建号后回填;转正时据此定位角色)
  state       String   @default("pending") // pending | converted | cancelled
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([siteUserId])
  @@map("raf_referral_pending")
}
```

**② `raf_recruit`**——正式招募关系(门户建、门户读)

```prisma
model RafRecruit {
  id            BigInt   @id @default(autoincrement())
  recruiterUserId BigInt // 招募人站点用户 id(由邀请码 owner_user_id 得出)
  recruitUserId   BigInt // 被招募人站点用户 id
  recruitGuid     Int    // 被招募角色 guid(转正时定位到的角色)
  codeId          BigInt
  ruleVersion     Int    @default(0)  // 判定时依据的规则版本(可对账)
  milestoneAt     DateTime?          // 全部必达条件齐备的时刻(观察期起算点)
  state           String  @default("pending") // pending | milestone | rewarded | invalid
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([recruitUserId])  // 一个账号一生只被招募一次
  @@index([recruiterUserId, state])
  @@map("raf_recruit")
}
```

> `uk(recruit_user_id)` 在**库层**挡住「一码多归 / 小号多归」。
> 关系行直接存**站点用户 id** ⇒ 发奖对象映射无需「游戏账号 → 站点用户」反查(省掉大小写口径坑)。

### 5.5 奖励:档位 / 台账 / 零元发货单

**① 奖励档位** `raf_reward_tier`(发什么;门户独有)

| 列 | 含义 |
| --- | --- |
| `id` | 档位 id |
| `event` | `raf_milestone`(单个被招募者达标) / `raf_recruit_target`(招募人招满) |
| `seq` | 阶梯序号(1=第 1 个被招募者,2=第 2 个……) |
| `product_id` | 奖励对应的**商城商品 id**(复用既有 SKU 与发货处理器) |
| `qty` | 数量(逐档递减) |
| `enabled` | 启用开关 |
| `sort` | 展示序 |

> 奖励一律引用**商城商品**(`itemsend_*` 物品 / `transmog-item_*` 幻化),不另造发货路径。
> 奖励商品必须是**专用隐藏商品**(后台可见、前台不展示、**不与在售商品共用**):
> 否则零元奖励单会**占用用户对该商品的限购额度**(`purchase-limit.ts` 的 `ITEM_OCCUPIED_STATUSES` 含 `completed`)。
> **阶梯总数即封顶**:只配 3 档 ⇒ 第 4 个被招募者起不再产生新档位奖励。

**② 发奖台账** `raf_reward_grant`(幂等 + 观察期状态机)

```prisma
model RafRewardGrant {
  id           BigInt   @id @default(autoincrement())
  userId       BigInt   // 获奖站点用户 id
  event        String   // raf_milestone | raf_recruit_target
  refId        BigInt   // raf_recruit.id(稳定唯一锚点)
  tierId       BigInt
  productId    BigInt
  qty          Int
  ruleVersion  Int      @default(0)
  status       String   @default("pending_observe") // pending_observe|review|approved|shipped|revoked|failed
  observeUntil DateTime // 观察期截止(到期才发)
  flagReason   String?  // 命中的风控信号(仅打标不拦;进人工复核)
  orderId      BigInt?  // 回引零元发货单 shop_order.id
  targetGuid   Int?     // 发往哪个角色 guid
  createdAt    DateTime @default(now())
  shippedAt    DateTime?
  revokedAt    DateTime?

  @@unique([userId, event, refId])   // 同一关系同一事件只发一次
  @@index([status, observeUntil])
  @@map("raf_reward_grant")
}
```

> 幂等**不靠** `point_transaction`(它连 `(refType,refId)` 唯一约束都没有),靠这张台账的 `@unique` (同 `badge_grant` 思路)。

**③ 零元发货单**:`shop_order` 加一列 `source VARCHAR(16) NOT NULL DEFAULT 'shop'`(值 `shop` / `raf_reward`)。
奖励发放走**订单状态机**:`point_cost = 0`、`status` 直接进 `paid` → 现有发货驱动 → `delivering` → `completed`;
失败进 `delivery_failed` → 重试 + 飞书告警 + 人工补发(宪法 III)。

**④ 零元发货单的四项必做与一项必避**(C14,逐条对应现有代码事实)

| # | 事项 | 原因(代码事实) |
| --- | --- | --- |
| 必做 1 | **写 `paidAt`** | 恢复扫描只捞 `status=paid AND paidAt < now-2min`(`delivery.ts:190-206`)⇒ 不写则失败单永远不会被重试捞起 |
| 必做 2 | **跳过 `debitLedger`** | 全站唯一建单处会先扣积分(`checkout.ts:195-220`)⇒ 零元单直接走扣分会产生 **0 元积分流水**,污染用户积分历史 |
| 必做 3 | **写 `order_item.params.characterGuid`** | 发货处理器读订单行 `params` 决定发给谁(`checkout` 里由 `r.params` 透传)⇒ 不写则角色寻址落空 |
| 必做 4 | **统计口径按 `source` 过滤** | 销售榜 / 概览 / 看板 / 订单列表多处按 `order_item` 聚合且**无 source 过滤**(`stats/sales.ts:44-62` 等)⇒ 零元单会灌进热销榜 sold_qty |
| 必避 | **不与在售商品共用限购额度** | 奖励单 `completed` 后仍占该商品限购额度(`purchase-limit.ts:16-21`)⇒ 必须用**专用隐藏商品** |

**⑤ 不涉及积分**(C10)⇒ **不新增** `PointTxType` 枚举值、**不动** `point_rule`、**不写**积分流水。

**⑥ 发放对象映射**

- 招募人 ⇒ 关系行的 `recruiter_user_id`(直接是站点用户 id);
- 被招募人 ⇒ 关系行的 `recruit_user_id`;
- 发往哪个角色:
  - 被招募人 ⇒ 固定发到 `raf_recruit.recruit_guid`(就是被招募的那个角色,无需选择);
  - 招募人 ⇒ **由招募人自己选**(账号下多个角色,奖励只有一个收件角色)⇒ 待发状态下在 RAF 页选,默认其**等级最高**角色;未选则不生成发货单,页面持续提示待选择。

### 5.6 游戏库读模型扩展(只读)

`prisma/schema-characters/schema.prisma` 需增:

| 模型 | 字段 | 对应 AC 真表 |
| --- | --- | --- |
| `Characters` 增列 | `totaltime Int` | `characters.totaltime` |
| 新模型 `CharacterAchievement` | `guid Int` / `achievement Int` / `date Int` | `character_achievement` |
| 新模型 `CharacterAchievementProgress` | `guid Int` / `criteria Int` / `counter Int` / `date Int` | `character_achievement_progress` |
| 新模型 `CharacterQuestStatus` | `guid Int` / `quest Int` / `status Int` / `explored Int` | `character_queststatus` |

> 只读模型,**不写、不写迁移**(游戏库 schema 归 AC 管,AGENTS 宪法 V)。
> `date` 是 unix 秒 ⇒ 转 UTC `DateTime` 时用 `new Date(date * 1000)`。

---

## 6. 流程与判定

### 6.1 归因(两段式,C7)

```
【第一段 · 门户】(注册即预登记,零额外操作)
 1. A 打开门户 /account/raf → 点「获取我的专属链接」
    → 门户生成专属码(随机、去混淆字符集、限次、可轮换),业务库记「属 A」
 2. A 把链接发给 B:https://lokta.cn/register?ref=ABC123
 3. B 点链接注册 → 门户**真正消费** invitation_code(本次起不再忽略)
    → 门户校验码:raf_scope=专属码 / available / 未过期 / 未超次数
    → 该码 used_count+1(次数口径唯一在业务库)
    → 写 raf_referral_pending(码 X → B 的站点用户 id,state=pending)
    → 建号成功后回填 game_account_id(注册流程已返回该 id)
    ※ 此时**不建立招募关系、不产生任何奖励**

【转正 · 门户】(建号后自动,须有真实角色)
 4. B 建游戏角色进游戏
    → 门户扫描 pending 行:按 game_account_id 查 characters(账号下角色)
    → 取该账号的**等级最高**角色(与发奖角色的默认口径一致)作为 recruit_guid
    → 写 raf_recruit(A 招募 B),state=pending
    ※ 玩家**无需再输码**(体验接近「注册即归因」),但必须有真实角色(防作弊)

【补录入口 · 门户】(给漏登记者自助)
 5. B 在 /account/raf 点「我注册时没填码,现在补绑」→ 输入 A 的码
    → 门户校验同一个码 → 写 raf_referral_pending(B)→ 同第 4 步转正
    ※ 不做游戏内 NPC/道具输码入口——那要求游戏端持有码表(副本),代价大于收益

【达标 · 门户】(条件求值;**游戏端零参与**)
 6. 门户按周期(cron)或页面惰性触发,对每条 pending/milestone 关系求值条件:
    · 对每个 required 条件行 → 调该类型的评估器读游戏库 → 达成则写 raf_condition_fact
    · 全部必达条件都有事实 ⇒ raf_recruit.milestone_at = 达成时刻,state=milestone
    ※ 门户**不发奖、不认识奖励** ⇒ 改奖励不用改任何游戏端代码(C11)

【发奖 · 门户】(待发 → 观察期 → 复核 → 零元发货)
 7. 读到「已达标」→ 命中奖励档位 → 台账落一行 status=pending_observe,
    observe_until = 达标时刻 + ObserveDays
 8. 观察期到期(cron 扫描 + 页面惰性)→ 逐条过闸:
    · 该账号注册满 AccountAgeDays(3 天)?(冷静期;同一道闸同时用于「计入招募目标」)
    · 角色累计在线时长 ≥ 阈值?(门户读 characters.totaltime)
    · 命中风控信号?(同 IP/同 C 段聚集 / 邀请图谱星型)⇒ 打标 flag_reason
      ├ 无信号 ⇒ status=approved
      └ 有信号 ⇒ status=review(转运营人工复核;通过则 approved,否则 revoked)
 9. approved ⇒ 生成零元发货单(source=raf_reward, point_cost=0, status=paid, **paidAt 必写**,
    **跳过扣积分**, order_item.params.characterGuid=收件角色)→ 现有发货驱动 → SOAP 发货
    → completed;失败 ⇒ delivery_failed + 重试 + 飞书告警 + 人工补发(宪法 III)
    → 台账 status=shipped,回引 order_id
```

### 6.2 达标判定的两处精度说明

| 条件类型 | 达成时刻来源 | 精度 |
| --- | --- | --- |
| 成就类 | 游戏库 `character_achievement.date` | **精确到秒** |
| 等级 / 时长 / 任务 | 门户观察到的时刻 | ≤ 一个扫描周期(cron 日频 ⇒ ≤24h) |

> 精度差**不影响公平性**:观察期(7 天)本就覆盖了「延迟发现」窗口;达标时刻只用于**起算观察期**,早发现对玩家更有利。

### 6.3 防作弊清单(落到具体机制)

> 行业共识:**入口不拦人,在发奖口拦人**——入口拦会误伤真实拉新;出口拦(延迟发放 + 打标 + 到期判定)成本低、可观察、可回滚。
> 信号类(同 IP / 同 C 段 / 邀请图谱)**只打标不拦**,进人工复核。

| 风险 | 机制 | 落点 | 强度 |
| --- | --- | --- | --- |
| 枚举码 | 随机码(去混淆字符集)、限次(`max_uses`)、可禁用、可轮换 | 门户生成 | 高 |
| 一码多归 | `raf_recruit.uk(recruit_user_id)`(一个账号一生只被招募一次) | 门户建关系时 | 高(库层) |
| **自邀/小号刷量** | **条件组合**(等级 + 角色在线时长 + 成就):脚本能拉等级,拉不满真实时长与成就 ⇒ 小号成本≈真实游玩成本 | 条件行(`char_level` / `char_playtime` / `achievement`) | **主闸** |
| **工作室批量养号** | **新号冷静期 3 天**:账号注册满 3 天其贡献才计入招募目标、也才允许发奖(按站点用户注册时刻判)⇒ 批量流水线要养号,成本按批量放大;真人拉朋友通常隔好几天才注册,不误伤 | 活动规则 `accountAgeDays` | **主闸** |
| **达标即领奖(套利窗口)** | **观察期延迟发奖 7 天**:达标后先挂「待发」,到期无异常才发 ⇒ 给风控留观察窗口,顺带获得「不发/回收」能力 | 活动规则 `observeDays` | **主闸** |
| 批量同源注册 | 同 IP / 同 C 段聚集、邀请图谱星型 ⇒ **只打标** + 进人工复核队列,**不硬拦**(避免误伤网吧/宿舍/家庭共用 IP) | 门户侧统计 + `flagReason` | 中(事后) |
| 重复发奖 | `raf_reward_grant` 唯一键 + 零元发货单状态机 | 门户 | 高 |
| 码被转卖/共用 | 限次 + 可禁用 + 可轮换 + 一码一账号(库层) | 门户 | 中 |
| 奖励被套现 | 奖励全部是**拾取绑定、不可交易**的游戏内物品;**不用积分**(不碰赞助收入) | 商品选型(运营核对) | 高 |
| 无限拉人套利 | 阶梯递减 + 每人每活动封顶一次 + 超额不计 | 奖励档位配置 | 中强 |
| 发放失败被吞 | 走订单状态机:失败进重试 + 飞书告警 + 人工补发(宪法 III) | 门户 | 高 |
| 挂机刷时长 | `totaltime` 含挂机 ⇒ 挂机也能拉满时长 | 组合闸 + 只打标 + 复核 | 中(已知取舍) |

> 结论:**奖励解锁的主闸是「真实游戏时长 + 冷静期 + 观察期」这三重时间成本**,不是绑定动作本身。
> 绑定动作的防作弊价值在于「必须有一个真实角色参与」,这正是两段式保留「须有真实角色」环节的理由。
> 冷静期 + 观察期 ⇒ 天然具备「不发/回收」能力。

### 6.4 时间与状态口径

- 时间一律 **UTC 存储**、展示走 `lib/format.ts`(AGENTS 规则 31);
- 状态枚举落 `src/constants/raf.ts`:**只放枚举与文案映射,不放规则数值**;
- 游戏库读到的 `date`/`totaltime` 是 unix 秒 ⇒ 换算在 `raf` 域内收口一处。

---

## 7. 门户侧设计

### 7.1 模块与边界

新建域目录 `src/server/services/raf/`(按 AGENTS 目录规范,新增域须先在 AGENTS.md 登记):

| 文件 | 职责 |
| --- | --- |
| `services/raf/rules.ts` | 活动规则读写 + 版本快照 + 审计 + 回滚 |
| `services/raf/conditions/index.ts` | **条件类型注册表**(类型键 → 评估器 + 参数 schema + 文案) |
| `services/raf/conditions/portal-evaluators.ts` | 等级 / 时长 / 成就 / 成就准则 / 任务 五类**只读**评估器 |
| `services/raf/conditions/facts.ts` | 事实求值与落表(幂等:`@unique([conditionId,guid])`) |
| `services/raf/codes.ts` | 专属码生成/自助领取/禁用 + 登记时校验 + 预登记写入 |
| `services/raf/attribution.ts` | 预登记 → 转正(读游戏库定位被招募角色)+ 关系维护 |
| `services/raf/rewards.ts` | 奖励档位读取 + 台账状态机 + **零元发货单生成**(复用商城发货链路) |
| `services/raf/risk.ts` | 风控信号计算(同 IP / 同 C 段聚集 / 邀请图谱星型)→ **只打标** |
| `services/raf/view.ts` | 本人视角投影(归属校验 + 角色维度隔离 + 降级态 + 奖励状态展示) |

依赖方向:`raf → shared`(game-identity / audit / site-identity)、`raf → catalog` + `raf → orders`(发奖复用商城的商品与发货链路;
须在 `eslint.config.mjs` 的 `ORCHESTRATION_EDGES` 登记 `raf: ["catalog", "orders"]`),
`catalog` / `orders` **不得**反向引 `raf`(单向,防循环)。
**不依赖 `points`**——奖励不用积分(C10)。

### 7.2 降级矩阵

| 情形 | 识别 | 门户行为 | HTTP |
| --- | --- | --- | --- |
| 游戏 characters 库**不可达** | 探针抛错 / `GameDbError` | 错误面板(琥珀色 `role="alert"`,沿用 characters 页样式) | 503,`GAME_DB_UNAVAILABLE` |
| **表/列不存在**(精简库、老库) | MySQL 1146 / 1054,或 Prisma `P2021` / `P2022` | **该条件类型判定为「不可评估」**→ 不产生事实、不发奖;后台条件编排页明示「该条件在当前游戏库不可评估」 | 200(前台)/ 200(后台,带不可评估标记) |
| 有数据但**无达标记录** | 查询空 | 空态:「暂无招募记录」 | 200,`enabled:true` |
| **未配置游戏库** | `getGameDb()` → `null` | 空态:「活动未开启」;后台规则页:「未接入游戏库,暂不可配置」 | 200,`enabled:false` |
| 其它错误 | 兜底 | 错误面板 | 503 |

> 「未配置」与「配错」必须分开(规则 38);「表/列不存在」是**常态不是故障**(精简游戏库可能裁列)⇒ 降级不报错。

### 7.3 API 契约

`GET /api/account/raf?guid=<角色 guid>`(缺省 = 本人第一个角色,按等级倒序)

```jsonc
{
  "enabled": true,
  "activity": {
    "targetCount": 3, "recruiterMinLevel": 30,
    "accountAgeDays": 3, "observeDays": 7, "status": "active",
    "startAt": "2026-11-20T00:00:00.000Z", "endAt": "2026-12-20T00:00:00.000Z",
    "ruleVersion": 7,
    "conditions": [
      { "id": 1, "condType": "char_level", "label": "达到 10 级", "threshold": 10, "required": true },
      { "id": 2, "condType": "char_playtime", "label": "累计在线 300 分钟", "threshold": 300, "required": true },
      { "id": 3, "condType": "achievement", "label": "完成成就 XXX", "required": true }
    ]
  },
  "character": { "guid": 12345, "name": "阿框", "level": 60, "playtimeMinutes": 900 },
  "progress": { "recruited": 2, "target": 3, "rewarded": 1 },
  "recruits": [
    { "guid": 22222, "name": "新兵", "level": 12, "state": "pending", "milestoneAt": null, "joinedAt": "..." }
  ],
  "rewards": [
    { "event": "raf_milestone", "state": "pending_observe", "reward": "大型背包",
      "observeUntil": "2026-11-27T00:00:00.000Z", "targetGuid": 22222 }
  ],
  "invite": { "code": "K3M9QX7A", "url": "https://lokta.cn/register?ref=K3M9QX7A" }
}
```

> 奖励状态对玩家可见:「已达标,观察期至 X 日后发放」比「已达标,已发放」更符合延迟发奖的设计,避免玩家以为丢了。
> `targetGuid` 对**招募人**的待发奖励可能为 `null`(尚未选收件角色)⇒ 前端须给选择入口;被招募人的奖励恒有值。

| 状态 | code | 场景 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 403 | `CHARACTER_NOT_OWNED` | guid 不属于本人(落 `OWNERSHIP_VIOLATION` 审计,沿用 restore-items 先例) |
| 503 | `GAME_DB_UNAVAILABLE` | 游戏库不可达 |

### 7.4 前台页面(`/account/raf`)

```
角色切换(本人角色列表,默认第一个)
├─ 招募进展卡:已招募 X / 目标 Y + 进度条 + 活动状态徽标
├─ 达成条件卡:条件清单(等级 / 时长 / 成就)+ 逐条 ✓/✗ + 说明「条件可由运营调整」
├─ 被招募者明细:角色名 / 等级 / 状态(待达标|已达标观察中|已发奖|已失效)/ 加入时间
├─ 奖励卡:奖励名 + 状态(待达标|观察期至 X 日|已发放)+ 发往哪个角色
│    （被招募人=固定其本人角色;招募人=待发时可选自己的角色,默认等级最高）
├─ 专属链接卡:码 + 链接 + 「复制链接」+「获取我的专属链接」(已领过则展示现有码)
├─ 补录入口(仅当该账号无归属关系时出现):「我注册时没填码」→ 输码补登
└─ 玩法说明:专属链接→注册(自动预登记)→建号进游戏自动转正→达成条件→双方拿奖
```

口径:时间走 `lib/format.ts`;颜色走语义 token(禁 arbitrary-hex,规则 26④);`target=0` 时进度条按 0 宽(不除零);
错误面板沿用 characters 页样式;状态徽标复用既有徽标组件思路,不另造第二套。

### 7.5 后台

**页一 · 活动规则与条件**(`/admin/raf/rules`)

- 活动级:目标人数 / 招募人等级门槛 / 新号冷静期天数 / 观察期天数 / 起止时间 / 活动状态;
- 条件行:**条件类型下拉**(只列注册表里的类型)+ 阈值 + 参数(按类型渲染,如成就 id / 备注名)+ 必达开关 + 启用开关 + 排序;
  - **新增条件类型 = 发版**(后台只列已注册的类型,防止运营填了没实现的类型);
  - 类型专属的「不可评估」提示(如当前游戏库没有 `character_achievement` 表 ⇒ 成就条件不可评估);
- **整页唯一「保存」按钮**(规则 15⑤);
- 保存后:写规则表 + 写版本快照 + 审计 + `ruleVersion+1`;
- 展示:当前版本号、最后修改人/时间;提供「版本历史」列表 + 「回滚到此版本」(回滚＝以旧快照新建版本,历史完整保留)。

**页二 · 奖励档位**(`/admin/raf/rewards`)

- 阶梯配置:事件(达标/招满)× 序号 × 奖励商品(从商城商品里选,**须为专用隐藏商品**)× 数量;启用开关;
- 奖励内容**只存在这里** ⇒ 改奖励不用动任何游戏端代码;
- **具体物品不在设计期定死**:品类按「容器背包 → 变装/幻化外观 → 坐骑」逐层递进,实际物品由运营在后台选定;
  选品时**逐条核对绑定属性**(须为拾取绑定、不可交易——这是「不可变现」的唯一保证,系统无法自动判定的部分靠人工核对);
- 阶梯总数即**每人每活动的封顶**;数量递减逐档配在 `qty`。

**页三 · 复核队列**(`/admin/raf/review`)

- 列出 `status=review` 的待发奖励:关系双方、命中的信号、观察期到期时间;操作:通过(转 approved 继续发) / 收回(转 revoked);
- 操作留审计(谁、何时、通过还是收回)。

---

## 8. 里程碑拆分与验收标准

| 段 | 内容 | 前置 | 验收标准 |
| --- | --- | --- | --- |
| **N1-a 条件模型与后台** | 活动规则表 + 条件行表 + **条件类型注册表**(五类评估器)+ 事实表 + 版本快照/审计/回滚 + 后台条件编排页 + `schema-characters` 读模型扩展(`totaltime` / `CharacterAchievement` / …) | 无 | ① 后台改规则即生效且版本 +1;② 版本历史可查可回滚;③ 审计含改动前后值;④ **条件行可增删改而不改表结构**;⑤ 缺失表/列时该条件「不可评估」而非报错 |
| **N1-b 邀请码与归因** | 邀请码扩列 + 自助领码 + 注册接口「接收并预登记」+ 补录入口 + **门户侧转正**(读游戏库定位角色) | N1-a | ① 玩家可自助领专属码,重复领取幂等;② 注册带码即预登记,一条账号只有一条;③ 通用码不参与绑定;④ 码次数在登记时扣减,只在业务库判定;⑤ 建号后自动转正,一码多归被唯一键挡住 |
| **N1-c 达标判定** | 条件求值编排 + 事实落表(幂等)+ 扫描任务(cron)+ 关系里程碑标记 | N1-b | ① 必达条件齐备 ⇒ 关系置 milestone 且记达成时刻;② 事实唯一键保证重复扫描不重复产出;③ 成就类达成时刻取游戏库真实 `date`;④ 时长按**角色级** `totaltime`;⑤ 事实带 `ruleVersion` 可对账 |
| **N1-d 门户展示** | RAF 页读真实数据 + 角色维度隔离 + 降级矩阵 + 专属链接 + 条件卡 + **奖励卡** | N1-b(有数据源) | ① 页面不再硬编码 0;② 越权 guid → 403 + 审计;③ 降级各态正确;④ 时间走 `lib/format.ts`;⑤ 奖励卡显示五态 |
| **N1-e 门户发奖** | 奖励档位表 + 发奖台账(唯一键防重)+ **观察期延迟发奖** + 冷静期/时长闸 + **人工复核队列** + **零元发货单**(含四项必做一必避)+ 风控只打标 + cron 兜底扫描 | N1-c | ① 同一关系同一事件只发一次(库层唯一键);② 观察期未到**绝不发**;③ 冷静期/时长不达标 ⇒ 转人工复核而非直接发;④ 零元单走通 `paid→completed` 且**不产生积分流水**;⑤ **失败单能被恢复扫描捞起**(`paidAt` 已写);⑥ 奖励商品不占用用户限购额度;⑦ 销售/订单统计不含零元单;⑧ 复核队列通过/收回均留审计 |

依赖:`N1-a → N1-b → N1-c → N1-e`;`N1-d` 依赖 `N1-b`,可与 `N1-c` 并行。
**全链无外部前置**(不需要 DBA 建库、不需要游戏端排期、不需要游戏端发版)。

---

## 9. 测试策略

| 层 | 覆盖 | 说明 |
| --- | --- | --- |
| 单元 | 条件类型注册表(每类型的阈值/参数 schema);状态枚举→文案映射;进度百分比边界(`target=0`、超额);台账幂等键构造;规则版本递增;**发奖闸门判定**(冷静期未过 / 在线时长不足 / 观察期未到 ⇒ 不进入可发态);奖励档位排序;**时长换算**(秒→分钟) | 单测集中在闸门矩阵与条件求值边界 |
| 集成(业务库真库) | 规则保存→版本快照→审计→回滚;**条件行增删改**后判定结果随之变化;**台账幂等**(同唯一键发两次只生成一条);**零元发货单**落库(`point_cost=0`、`source='raf_reward'`、`paidAt` 非空、**无积分流水**、状态推进 `paid→delivering→completed`);失败 ⇒ `delivery_failed` + 可观测 | 用业务库跑真迁移 |
| 集成(游戏库) | 条件评估器:等级/时长/成就/任务四类求值;**表/列缺失 ⇒ 不可评估**;成就达成时刻取 `date`;时长取角色级 `totaltime` | 测试栈建同构游戏库 |
| E2E | `/account/raf` 空态与有数据;后台改规则(版本+1);**后台加一条条件后判定随之变化**;后台改奖励档位;**复核队列**通过/收回;越权 403;注册带码 → 预登记 → 转正;**奖励卡五态**渲染 | 测试栈自带 fixture |
| 守卫 | ① `raf` 域**不得**写 AC 四库(只读);② 规则与条件数值**不得**进 `src/constants/`;③ **发奖幂等不得依赖流水唯一性**(流水无 `refType/refId` 唯一键,幂等在台账);④ **`raf` 域不得引用积分**;⑤ **零元单不得调 `debitLedger`**、**不得漏写 `paidAt`**、**不得漏写 `params.characterGuid`**(守卫扫 `services/raf/rewards.ts`);⑥ **销售/订单统计必须按 `source` 过滤**;⑦ 条件类型注册表里的每个类型**必须有一个评估器**(注册表与实现同源校验) | 参照 `tests/unit/mcp-tools.test.ts` 的接线守卫写法 |

**测试栈前置**:E2E 覆盖真实读路径,测试栈须具备可读的 characters 库(含 `totaltime` / `character_achievement` / `character_queststatus`)与账号-角色数据。

---

## 10. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| **AC 升级改列名/删列** | 门户读模型失配 | 缺列/缺表 ⇒ 该条件「不可评估」并明示(不报错);读模型改动集中在 `schema-characters` 一个文件 |
| **门户依赖游戏库可达** | 游戏库抖动时 RAF 页报错 | 降级矩阵(§7.2):不可达 503 面板、缺列降级为不可评估 |
| 达标时刻精度(等级/时长 ≤ 一个周期) | 玩家觉得「早该达标了」 | 成就类精确到秒;观察期覆盖延迟窗口,不影响公平;页面显示条件逐条达成状态 |
| 端口径漂移 | 页面数字与实际发奖不一致 | 达标判定与发奖**同源**(同一套条件行 + `ruleVersion` 回引),无第二套口径 |
| 刷奖励(自邀/小号/一码多归/批量注册) | 奖励被套利 | 一账号一归属(库层唯一键)+ **条件组合**(等级/时长/成就)+ **新号冷静期 3 天** + **观察期延迟发奖** + **人工复核队列** + 阶梯递减 + 每人每活动封顶;信号类**只打标不拦** |
| **观察期延迟发奖引发投诉** | 玩家认为「达标了却没发」 | 奖励卡明确显示「观察期至 X 日」;门槛值后台可调;不足观察期**只延后不发**,不静默 |
| **零元单四必做漏做** | 单不被重试捞起 / 产生 0 元流水 / 发错角色 / 灌进热销榜 | C14 逐条列明 + 守卫⑤⑥扫源码 |
| **奖励商品与在售商品共用** | 占用用户限购额度,引发投诉 | 奖励须用**专用隐藏商品**;后台奖励档位页在选品时提示 |
| 奖励「拾取绑定不可交易」依赖运营核对 | 若物品实际可交易,变现路径未清零 | 发放前在后台逐条核对物品绑定属性;发现可交易物品即从奖励档位移除并记录 |
| 复核队列积压 | 玩家等待过久 | 队列页显示待复核数与停留时长;积压超阈值进飞书告警(规则 37 口径) |
| 越权查看他人招募数据 | 隐私泄漏 | 归属校验前置于查询,越权 403 + `OWNERSHIP_VIOLATION` 审计 |
| 邀请码两套用途混淆 | 运营与玩家困惑 | 合并为一套表 + `raf_scope` 区分;通用码不参与绑定 |
| 漏登记者无法自助补绑 | 玩家要联系客服 | 门户 RAF 页提供补录入口,不做游戏内 NPC/道具输码 |
| 成就/任务无中文名来源 | 后台配置可读性差 | 条件行存运营填写的备注名;成就 id 与备注名同屏展示 |
| `totaltime` 含挂机 | 挂机也能拉满时长 | 已知取舍:组合闸 + 只打标 + 复核承担剩余风险 |
| `game` 执行器(C13 预留位)本期不启用 | 未来需要游戏端事实时要发版 | 预留位明确标注「本期不启用」;启用时只加评估器 + 契约表,不改既有条件行 |

---

## 11. 待决问题(带建议默认值,需拍板后冻结)

> 已拍板(2026-11-20 核对):**方案 B(游戏端零改动)**;**条件 = 等级 + 游戏时长 + 成就且可扩展**;**游戏时长用角色级**;通用码不参与绑定;补录入口放门户 RAF 页自助;奖励取消积分;发奖走门户统一发货;新号冷静期 3 天;观察期延迟发奖;在线时长门槛;人工复核队列;信号类只打标不拦。
> 其余项按建议默认值冻结,实施前如有异议再改(均可在后台调整,不需改代码)。

| # | 问题 | 建议默认 | 状态 |
| --- | --- | --- | --- |
| 1 | 被招募者达标等级门槛 | 10 级(后台可改) | 待确认 |
| 2 | 目标招募人数 | 3 人(后台可改) | 待确认 |
| 3 | 在线时长门槛 | 累计 300 分钟(**角色级** `totaltime`) | 待确认 |
| 4 | 成就条件指定哪些成就 | 本期**留空**(成就 id 与备注名由运营在后台填) | **待运营配置** |
| 5 | 招募人领取「招满」奖的等级门槛 | 30 级 | 待确认 |
| 6 | 专属码粒度 | 每活动每人一个,可随时轮换(旧码即失效) | 待确认 |
| 7 | 码的可用次数 | 专属码 1 次;通用码沿用后台配置 | 待确认 |
| 8 | 任务类条件本期是否启用 | **不启用**(注册表保留 `quest_completed` 类型,后台可选) | 待确认 |
| 9 | `game` 执行器(游戏端事实)本期是否启用 | **不启用**(C13 预留位) | **已拍板(预留)** |
| 10 | 条件行是否支持「非必达(加分项)」 | 支持(`required=false`,不计达标) | 待确认 |
| 11 | 零元奖励单是否要在后台订单列表可见 | 可见但按 `source=raf_reward` 标注,不进销售统计 | 待确认 |
| 12 | eluna 配置项是否下线 | 本期**不动**(v5 不再使用它;当前零业务用途,可另开清理项) | **待另开** |
| 13 | 奖励阶梯具体物品 | **不在设计期定死**——由运营在后台「奖励档位」页从**专用隐藏商品**中选定,品类为「容器背包 → 变装/幻化外观 → 坐骑」,全部**拾取绑定、不可交易** | **已拍板(品类 + 配置方式)·物品待运营配置** |
| 14 | 是否要「游戏内发奖物品明细」表(对账到物品粒度) | 本版不记(台账记目标商品与订单 id 即可对账) | 待确认 |

---

## 12. 文档回写清单

| 文档 | 改动 |
| --- | --- |
| `docs/README.md` | 索引表本文件描述按第 5 版改写(方案 B + 条件可扩展) |
| `docs/requirement/02-功能规格说明书.md` | §3.4 RAF 行补指向本方案;§3.4.1 口径要点按第 5 版改写(门户自治、条件注册表、门户零元发货、防作弊组合闸) |
| `docs/plan/development-plan.md` | N1 状态与依赖关系按 N1-a～N1-e 改写(去 N1-0/N1-c;全链无外部前置) |
| `AGENTS.md` | ① 登记新域 `services/raf/`(目录规范 2);② 登记 `raf → catalog/orders` 编排边(**无 `raf → points`**);③ 登记「条件类型注册表」口径(新增门槛=加行免发版,新增类型=加评估器);④ 登记「零元发货单四必做一必避」口径(复用既有发货链路的坑位);⑤ 登记「奖励不用积分」及其后果 |

---

## 附录:代码事实索引(便于复核本文结论)

| 结论 | 复核位置 |
| --- | --- |
| RAF 页是静态硬编码、API 是空态桩 | `src/app/(account)/account/raf/page.tsx`、`src/app/api/account/raf/route.ts` |
| 归属校验与越权审计先例 | `src/server/services/account/restore-items.ts`、`src/server/services/shared/game-identity.ts` |
| 503 错误面板先例 | `src/app/(account)/account/characters/page.tsx` |
| 站点用户 → 游戏账号 id 的正向映射 | `src/server/services/shared/game-identity.ts`(`resolveGameAccountId`) |
| 游戏账号名存大写 | `src/lib/db/auth.ts`(`findByUsername` 上转) |
| 邀请码状态机与码值形态 | `src/constants/invitation.ts` |
| 注册接口当前忽略邀请码 | `src/app/api/auth/register/route.ts` |
| 跨库写无原子性 + 补偿方向 | `src/server/services/auth/register.ts`(`purgeSiteUser`) |
| 全站唯一建单处(扣积分 + `paidAt` + `params`) | `src/server/services/shop/checkout.ts:195-220` |
| 恢复扫描的捞单条件 ⇒ `paidAt` 必写 | `src/server/services/shop/delivery.ts:190-206` |
| 零元单会占商品限购额度 | `src/server/services/catalog/purchase-limit.ts:16-21` |
| 销售榜无 `source` 过滤 | `src/server/services/stats/sales.ts:44-62` |
| 幂等台账先例 | `prisma/schema-business/schema.prisma`(`badge_grant`) |
| 发货链路可复用(零元单走同一条) | `src/server/services/shop/`、`src/constants/soap.ts`、AGENTS 规则 3 |
| AC 角色表字段与索引 | `data/sql/base/db_characters/characters.sql`(`totaltime` 在 :51、`idx_account` 在 :105) |
| AC 成就表结构 | `data/sql/base/db_characters/character_achievement.sql` |
| AC 成就准则计数表 | `data/sql/base/db_characters/character_achievement_progress.sql` |
| AC 任务表结构 | `data/sql/base/db_characters/character_queststatus.sql` |
| AC 账号表(账号级时长、大写用户名) | `data/sql/base/db_auth/account.sql` |
