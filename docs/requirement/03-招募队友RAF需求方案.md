# 招募队友（RAF）需求方案设计

> 里程碑:二期 N1「招募队友」(见 `docs/plan/development-plan.md` N1 条目)
> 文档性质:**需求与设计基准**。写法以 **git 仓库代码事实**为准,规划文档只作参考。
> 状态:**已核对定稿(第 4 版)**｜编写日期:2026-11-20｜核对结论:维护方认可整体方向,并拍板「共享库不留码副本」「补录入口放门户页自助」「奖励取消积分」「发奖走门户统一发货」
> 第 4 版相对第 3 版的改动(全部集中在**奖励与防作弊**):① 奖励**取消积分**(积分是站点赞助收入,赠送会削弱赞助)⇒ 改为游戏内**拾取绑定、不可交易**的物品,阶梯为「容器背包 → 变装/幻化外观 → 坐骑」;② **发奖统一走门户发货链路**——游戏端只判定「达标」并落库,门户生成**零元发货单**走既有 SOAP 发货驱动(宪法 III:失败有重试 + 告警 + 人工补发);③ 防作弊从「等级门槛单闸」升级为**组合闸**:新号冷静期 3 天 + **观察期延迟发奖** + 游戏内在线时长门槛 + 人工复核队列 + 阶梯递减 + 每人每活动封顶,信号类(同 IP/同 C 段/邀请图谱星型)**只打标不拦**;④ 连带**不新增** `PointTxType` 枚举值、不动 `point_rule`、无积分流水。
> 第 3 版相对第 2 版的改动:① 活动规则改为**共享库内唯一一张表**(第 2 版是「门户真身 + 游戏侧副本 + 同步」,属同一类「真身+副本」错误);② 连带去掉共享库里的**邀请码副本**(码的有效性只在门户侧判定,游戏端不读码)⇒ 整个 RAF 数据面零副本、零同步链路;③ 归因改为**两段式**(注册预登记 → 游戏端转正);④ 补录入口从「游戏内 NPC/道具输码」改为**门户 RAF 页自助补录**。
> 相关:规格书 §3.4「用户中心 · RAF 招募进度」、AGENTS.md 规则 5(游戏四库只读)/ 38(可选依赖语义)/ 31(时间口径)/ 3(发货可靠可见)/ 35①(能力投影复用同一入口)

---

## 1. 背景与目标

老站(WordPress)有「招募队友(RAF)」玩法:玩家拿到专属链接,拉新玩家注册建号即建立招募关系,
被招募角色达到等级里程碑后双方获奖赏。M1 已在门户搭好页面骨架与 API 骨架,但**数据接口始终是空态硬编码**。

N1 目标(沿用 development-plan N1 验收标准):

1. RAF 页展示**真实招募数据**,不再是硬编码零值;
2. **角色维度隔离**——只展示当前所选角色的招募进度;
3. 游戏端脚本未产出数据时**明确空态而非报错**;
4. 依赖的 eluna 库缺失**不拖垮门户**(降级而非启动自检失败)。

三条经核对确认的设计底线,贯穿全文:

- **规则唯一真相源**——活动规则在物理上只有一张表,门户写、游戏端读,不做「真身+副本」两套(第 2 版方案的错误);
- **改活动参数免游戏侧发版**——游戏端不硬编码任何规则数值,每次判定都读表;
- **改动可追踪**——规则变更留版本快照 + 审计,可查历史、可回滚。

---

## 2. 已拍板的决策(2026-11-20 核对结论)

| # | 决策 | 影响 |
| --- | --- | --- |
| **C1** | RAF 数据落**游戏侧独立 `acore_eluna` 库**(站点方自建,非 AC schema) | 需 DBA 在游戏侧建库授权 |
| **C2** | 招募关系**在游戏内首次绑定时建立**(游戏端归因) | 注册接口维持现状(忽略邀请码) |
| **C3** | **游戏内要有奖励**:奖励全部是**游戏内物品**(容器背包 → 变装/幻化外观 → 坐骑,逐层递进) | 游戏端必须读得到规则 ⇒ 规则表与游戏端同库 |
| **C4** | **双方都拿**奖励(招募人 + 被招募人各一份,阶梯不同) | 招募人侧门槛更高(招满 N 人 + 自身等级门槛),被招募人侧门槛更低 |
| **C5** | **邀请码合并成一套**:RAF 专属链接携带的就是门户既有邀请码;玩家可自助领取专属码 | 邀请码表扩展「归属用户/角色」;**码只存在业务库**,游戏端不读码(登记时由门户校验并写预登记) |
| **C6** | 活动规则**唯一一张表**放在共享库,门户写、游戏端读;门户后台可视改 + 审计留痕 + 版本可回溯 | 无副本、无同步链路;改参数秒级生效且免游戏侧发版 |
| **C7** | 绑定采用**两段式**:注册带码**预登记** → 建号进游戏后**一键转正** | 体验接近「注册即归因」,防作弊保留「须有真实角色」 |
| **C8** | 奖励解锁的主闸是**等级门槛 + 游戏内在线时长门槛** | 门槛值属规则 ⇒ 也在规则表,门户可配 |
| **C9** | **共享库内不存在任何「副本」**:配置面 3 张表门户写、事实面 1 张表游戏端写,写集完全不相交 | 整个 RAF 数据面**零副本、零同步链路**;游戏端不需要读码(门户登记时已校验) |
| **C10** | **奖励不用积分**(积分是站点赞助收入,赠送会削弱赞助) | 奖励 = 游戏内**拾取绑定、不可交易**的物品 ⇒ 变现路径基本清零;连带**不新增** `PointTxType` 枚举值、不动 `point_rule` |
| **C11** | **发奖统一走门户发货链路**:游戏端只判定「达标」并落库,**门户零元发货**(不扣积分) | 复用订单状态机 + SOAP + 重试 + 飞书告警 + 人工补发(宪法 III「发货必须可靠可见,禁止静默」);奖励配置放门户后台 ⇒ 改奖励免游戏侧发版 |
| **C12** | 防作弊闸门组合:**新号冷静期 3 天 + 观察期延迟发奖 + 在线时长门槛 + 人工复核队列 + 阶梯递减 + 每人每活动封顶** | 入口不拦人(避免误伤真实拉新),**在发奖口拦人**(延迟/不发/回收);信号类(同 IP/同 C 段/邀请图谱星型)**只打标不拦** |

---

## 3. 现状(代码事实 + 生产只读核实)

### 3.1 门户侧已就位的骨架

| 位置 | 事实 |
| --- | --- |
| `src/app/(account)/account/raf/page.tsx` | M1 静态页:「已招募 0 人」硬编码 + 玩法说明三行 |
| `src/app/api/account/raf/route.ts` | M1 桩:`apiOk({ recruited: [], total: 0 })` |
| `src/constants/navigation.ts` | `ACCOUNT_NAV` 已含「RAF 招募」入口 |
| `prisma/schema-eluna/schema.prisma` | eluna client 只有 `ConnectionProbe`(`@@ignore` 占位),**无业务模型** |
| `src/lib/db/eluna.ts` | `getElunaDb()`:未配置返回 `null`;已配置则建连并缓存 |
| `src/lib/db/index.ts` | 启动自检:eluna 未配置→`skipped` 不算失败;配了连不上→fail-fast |
| `src/lib/config.ts` | `gamedb.eluna` 为 `z.string().url().optional()`;空串/纯空白归一为未配置 |
| `src/server/services/settings/schemas.ts` | `gamedb.eluna` 敏感模式 `masked-clearable`(可擦空清除) |
| `src/server/services/shared/game-identity.ts` | `resolveGameAccountId` / `listOwnCharacters` / `characterOwnedBy` / `listCharacterNamesByGuids` / `GameDbError` |
| `src/server/services/shared/site-identity.ts` | `getSiteUsername(userId)`(正向);**缺「游戏账号 → 站点用户」反查**(C4 给被邀请方发奖励时需要补) |
| `src/server/services/account/restore-items.ts` | 归属校验 + 越权审计(`OWNERSHIP_VIOLATION`)先例 |
| `src/app/(account)/account/characters/page.tsx` | `GameDbError` → 琥珀色错误面板先例 |
| `prisma/schema-business/schema.prisma` | 业务库已有 `invitation_code` / `invitation_code_use`(`@@unique([codeId,userId])`)/ `point_rule` / `point_transaction`(`PointTxType` 是 **MySQL enum**)/ `badge_grant`(`@@unique([badgeId,userId])` + `pointTransactionId` 回引 = **积分幂等台账先例**) |
| `src/server/services/points/rules.ts` | 获取类积分经 `point_rule` 表驱动;缺行或停用 ⇒ 0(缺省不发)(**本方案不用积分**) |
| `src/server/services/shared/ledger.ts` | `creditLedger` 记流水 + 余额同事务;`point_transaction` **无 `(refType,refId)` 唯一约束** ⇒ 幂等不能靠流水,须另建台账 |
| `src/constants/soap.ts` + `src/server/services/shop/handlers/` | SOAP 命令含 `SEND_ITEMS` / `TRANSMOG_ADD` / `CHARACTER_CUSTOMIZE` 等;**无 SendGold ⇒ 门户发不了金币**;物品/幻化/改名等均有现成发货处理器 ⇒ 奖励物品类发货**无需新增 SOAP 命令** |
| `prisma/schema-business/schema.prisma`(`Order` / `OrderItem`) | `OrderItem.productId` **必填** ⇒ 零元奖励单也须挂一个商城商品(奖励档位即指向商品);`Order` 有 `pointCost` / `status` / `deliveryClaimUntil` ⇒ 零元单(`pointCost=0`)可复用同一状态机与重试 |
| `src/app/api/auth/register/route.ts` | 「M1 注册不要求邀请码,`invitation_code` 兼容接收但忽略」 |
| `src/constants/invitation.ts` | 邀请码状态机 `available/disabled/finish` + `expired` 实时推导不落库;`INVITATION_LIMITS` 码值形态与随机字符集 |

### 3.2 生产实况(2026-11-20 只读核实)

| 事实 | 影响 |
| --- | --- |
| 游戏侧 MySQL 主机只有 `acore_auth` / `acore_characters` / `acore_world`,**没有 eluna 库** | C1 的库需新建(DBA 动作) |
| `acore_characters.character_social` 是 AC 标准好友表(guid/friend/flags/note),**不是招募关系表** | 不可拿它当 RAF 数据源 |
| 门户生产 MySQL 里已存在 `acore_eluna` 库,但**一张表都没有** | 空壳;且在门户容器网络内(生产 DB 不发布端口)⇒ **游戏端写不进去** ⇒ 不能复用,须在游戏侧另建 |
| 生产 `gamedb.eluna` 指向门户自身 MySQL 容器内的 `acore_eluna` | 门户能读,但**游戏端写不到** ⇒ 与 C1/C2/C3 冲突,指向须改到游戏侧新库 |

> 生产 `gamedb.eluna` 的最终指向由维护方**手工**处理(不在本方案范围);本方案只保证门户侧在库缺失时降级不报错。

---

## 4. 参与方与职责边界

```
┌──────────── 门户(Next.js)────────────┐        ┌── acore_eluna(游戏侧主机,站点方自建)──┐
│ 业务库(门户真相源)                     │        │ 配置面(门户写 / 游戏端只读)           │
│  · 奖励档位 raf_reward_tier             │        │  raf_activity_rule        ← 唯一规则表 │
│  · 发奖台账 raf_reward_grant(幂等)     │        │  raf_activity_rule_version            │
│  · 邀请码真身 invitation_code(扩列)    │        │  raf_referral_pending                 │
│  · 零元发货单 shop_order(source)       │        │ ────────────────────────────────    │
└────────────────────────────────────────┘        │ 事实面(游戏端写 / 门户只读)             │
                                                   │  raf_recruit(关系+里程碑+在线时长)    │
                                                   └──────────────────────────────────────┘
                    ▲ 读写共享库(门户写配置面 / 游戏端写事实面)   ▲ 游戏端写事实面
                    │                                              │
        characters 库(等级/名,只读)  ─────────►  游戏端 Eluna 脚本
```

**职责边界表**

| 事项 | 门户 | 游戏端 |
| --- | --- | --- |
| 活动规则(**唯一一张表**) | ✅ 写 + 后台改 + 审计 + 版本 | ❌ 只读,每次判定现读 |
| 邀请码(**真身只在业务库**) | ✅ 生成/禁用/自助领码/登记时校验 | ❌ **完全不读码**(码的有效性在登记时已定) |
| 注册预登记(码 → 账号) | ✅ 写 | ❌ 只读(建号后据此转正) |
| 招募关系的建立(归因) | ❌ 不参与 | ✅ 建号后转正时写 `raf_recruit` |
| 里程碑判定 | ❌ 不判定 | ✅ 按规则表现读表判定并落 `milestone/state` |
| 游戏内在线时长统计 | ❌ 不统计 | ✅ 累计并落库(门户只读门槛值) |
| **奖励内容配置** | ✅ 后台配档位与物品 | ❌ **完全不知道奖励是什么**(不含任何物品 ID) |
| **奖励发放** | ✅ 零元发货单 → SOAP 发货 | ❌ **不发奖**(只判定达标) |
| 发奖闸门(冷静期/时长/观察期/复核) | ✅ 判定 | ❌ 不参与 |
| 进度展示 | ✅ 只读游戏端落库的结果 | — |

**边界怎么讲(一句话)**

> **共享库里,门户写「配置面」3 张表,游戏端写「事实面」1 张表,两边写的表不重叠。**
> 配置面 = 活动规则(唯一真相源)/ 规则版本 / 注册预登记;事实面 = 招募关系(含里程碑与发奖标记)。

写集不相交 ⇒ 不会出现「谁覆盖谁」;规则表只有一张 ⇒ 不存在副本与同步链路;配置面与事实面**同库** ⇒ 游戏端读到的一定是门户刚改的那份。

> **为什么共享库里没有「邀请码副本」**:码是门户侧资产,登记(注册/自助补登)时由门户校验有效性并写入预登记行;
> 游戏端只凭预登记行转正,**从不需要自己验码** ⇒ 没有副本的必要,也就没有「副本过期」这一类同步故障。

**规则唯一真相源的具体形态(C6)**

- 规则表物理位置:`acore_eluna.raf_activity_rule`,**物理上仅此一张**;
- 门户后台改它 ⇒ 写的就是游戏端读的那张表 ⇒ **同一张表,游戏端立刻读到,零延迟、零同步、零「同步失败导致口径不一致」**;
- 规则版本历史 `raf_activity_rule_version` 同库同面(游戏端不读);
- **门户业务库不存任何活动规则** ⇒ 没有第二份;
- 游戏端**不硬编码规则数值**,每次判定现读表 ⇒ 改参数免游戏侧发版;
- **规则数值不得进 `src/constants/`**(改了要发版且 git 里零散难追)。

**两条必须承认的代价**

1. 门户后台改规则要求**游戏侧库可达**;不可达时页面明示「游戏侧库不可达,暂不可改」(降级不报错)。
2. 活动规则**不在门户备份范围**(门户备份只备业务库);它是可重建的活动配置,但要知道这点。

---

## 5. 数据契约

### 5.1 共享库 `acore_eluna`(游戏侧主机,站点方自建)

> 由 DBA 在游戏侧主机建库授权:worldserver 账号读写;门户账号**仅对配置面 3 张表可写、事实面只读**。

**① `raf_activity_rule`**(门户写 / 游戏端读)—— **活动规则唯一真相源**,单行有效

```sql
CREATE TABLE `raf_activity_rule` (
  `Id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `TargetCount`         INT UNSIGNED NOT NULL DEFAULT 3   COMMENT '目标招募人数',
  `MilestoneLevel`      INT UNSIGNED NOT NULL DEFAULT 10  COMMENT '被招募角色达到该等级即达标(奖励解锁线)',
  `OnlineMinutes`       INT UNSIGNED NOT NULL DEFAULT 300 COMMENT '被招募角色累计在线分钟门槛(脚本可拉等级但骗不了真实在线)',
  `RecruiterMinLevel`   INT UNSIGNED NOT NULL DEFAULT 30  COMMENT '招募人领取「招满目标」奖的等级门槛',
  `AccountAgeDays`      INT UNSIGNED NOT NULL DEFAULT 3   COMMENT '新号冷静期:账号注册满 N 天才计入(门户判定)',
  `ObserveDays`         INT UNSIGNED NOT NULL DEFAULT 7   COMMENT '观察期:达标后等 N 天无异常才发奖(门户判定)',
  `Status`              VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT 'draft|active|closed',
  `StartAt`             DATETIME     NOT NULL             COMMENT '活动开始时刻(UTC)',
  `EndAt`               DATETIME     NOT NULL             COMMENT '活动结束时刻(UTC)',
  `RuleVersion`         INT UNSIGNED NOT NULL DEFAULT 1    COMMENT '规则版本(每次保存+1,发放记录回引)',
  `UpdatedAt`           DATETIME     NOT NULL             COMMENT '最近保存时刻(UTC)',
  PRIMARY KEY (`Id`),
  KEY `idx_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 活动规则(唯一真相源;门户写,游戏端读)';
```

> **全部活动参数集中在这张表**(含游戏端用不到的 `AccountAgeDays` / `ObserveDays`)——后台一页改完,游戏端只读它需要的 4 个字段
> (`MilestoneLevel` / `OnlineMinutes` / `TargetCount` / `RecruiterMinLevel`),其余字段对游戏端是「读了不用」。
> 分散到两张表会让「活动参数在哪改」变成不确定 ⇒ **参数只此一处**。

**② `raf_activity_rule_version`**(门户写)—— 版本历史,可回溯/可回滚

```sql
CREATE TABLE `raf_activity_rule_version` (
  `Id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `RuleVersion` INT UNSIGNED NOT NULL             COMMENT '规则版本号',
  `Snapshot`    JSON         NOT NULL             COMMENT '该版本规则全量快照',
  `OperatorId`  BIGINT       NOT NULL             COMMENT '操作管理员 id',
  `CreatedAt`   DATETIME    NOT NULL             COMMENT '保存时刻(UTC)',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `uk_version` (`RuleVersion`),
  KEY `idx_created` (`CreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 活动规则版本历史';
```

**③ `raf_referral_pending`**(门户写 / 游戏端读)—— 注册预登记(两段式第一段)

```sql
CREATE TABLE `raf_referral_pending` (
  `Id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `Code`           VARCHAR(64) NOT NULL              COMMENT '邀请码',
  `InviteeAccount` INT UNSIGNED NOT NULL              COMMENT '被邀请人游戏账号 id(注册即知)',
  `State`          VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending|cancelled(仅门户写:登记后作废)',
  `CreatedAt`      DATETIME    NOT NULL              COMMENT '登记时刻(UTC)',
  `UpdatedAt`      DATETIME    NOT NULL              COMMENT '最近更新时刻(UTC)',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `uk_account` (`InviteeAccount`)          COMMENT '一个账号只有一条预登记',
  KEY `idx_code` (`Code`),
  KEY `idx_state` (`State`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 注册预登记(门户写,游戏端读)';
```

> 预登记行**只由门户写**(登记时写、转正与否不改它);「是否已转正」以 `raf_recruit` 中有没有该账号的行为准 ⇒ 同一张表也不会出现两方改同一行。

**④ `raf_recruit`**(游戏端写 / 门户读)—— 正式招募关系 + 里程碑 + 游戏内发奖标记

```sql
CREATE TABLE `raf_recruit` (
  `Id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `RecruiterGuid`    INT UNSIGNED NOT NULL             COMMENT '招募人角色 guid',
  `RecruiterAccount` INT UNSIGNED NOT NULL             COMMENT '招募人游戏账号 id',
  `RecruitGuid`      INT UNSIGNED NOT NULL             COMMENT '被招募角色 guid',
  `RecruitAccount`   INT UNSIGNED NOT NULL             COMMENT '被招募账号 id',
  `InviteCode`       VARCHAR(64)  NOT NULL             COMMENT '归因用的邀请码',
  `State`            VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|milestone|rewarded|invalid',
  `Milestone`        INT UNSIGNED NOT NULL DEFAULT 0   COMMENT '已达成的里程碑序号(0=未达成)',
  `MilestoneLevel`   INT UNSIGNED NOT NULL DEFAULT 0   COMMENT '达标时的角色等级',
  `OnlineMinutes`    INT UNSIGNED NOT NULL DEFAULT 0   COMMENT '达标时的累计在线分钟',
  `MilestoneAt`      DATETIME     NULL                 COMMENT '达标时刻(UTC,门户观察期起算点)',
  `RuleVersion`      INT UNSIGNED NOT NULL DEFAULT 0   COMMENT '判定时依据的规则版本(可对账)',
  `GameRewardAt`     DATETIME     NULL                 COMMENT '预留:游戏端直发奖时刻(本版游戏端不发奖,恒空)',
  `CreatedAt`        DATETIME     NOT NULL             COMMENT '关系建立时刻(UTC)',
  `UpdatedAt`        DATETIME     NOT NULL             COMMENT '最近更新时刻(UTC)',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `uk_recruit_account` (`RecruitAccount`)   COMMENT '一个账号只被招募一次',
  KEY `idx_recruiter` (`RecruiterGuid`, `State`),
  KEY `idx_code` (`InviteCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 招募关系(游戏端写,门户读)';
```

> `MilestoneAt` + `RuleVersion` 记在关系行上 ⇒ **达标口径可对账到「哪条关系、按哪版规则、什么时候达标」**;
> 实际发奖落在门户的 `raf_reward_grant` 台账与零元发货单上(游戏端不参与发奖)。

### 5.2 门户业务库(门户真相源)

**① 邀请码扩展**(既有 `invitation_code` 加列,迁移幂等)

| 新增列 | 含义 |
| --- | --- |
| `owner_user_id` BIGINT NULL | 归属站点用户(玩家自助领码时写入;后台批量生成的通用码为 NULL) |
| `owner_guid` INT NULL | 归属角色 guid(玩家自助领码时写入) |
| `raf_scope` TINYINT(1) | 是否 RAF 专属码(1=是;0=普通邀请码,不参与游戏内绑定) |

既有 `max_uses` / `expires_at` / `status` / `used_count` **沿用不改语义**;专属码同样受次数与过期约束(次数在**登记时**由门户扣减,游戏端不参与)。

**② 奖励档位配置** `raf_reward_tier`(发什么;门户侧独有,游戏端不参与)

| 列 | 含义 |
| --- | --- |
| `id` | 档位 id |
| `event` | `raf_milestone`(单个被招募者达标) / `raf_recruit_target`(招募人招满) |
| `seq` | 阶梯序号(1=第 1 个被招募者,2=第 2 个……)**递减靠阶梯表达**:后面的档发更好的东西,数量递减 |
| `product_id` | 奖励对应的**商城商品 id**(复用既有 SKU 与发货处理器) |
| `qty` | 数量 |
| `enabled` | 启用开关 |
| `sort` | 展示序 |

> 奖励一律引用**商城商品**(`itemsend_*` 物品 / `transmog-item_*` 幻化),不另造一套发货路径
> (AGENTS 规则 35①「MCP/新功能都是后台能力的投影」同理:奖励是商城能力的投影)。
> 奖励商品可以是**不上架/隐藏**的商品(后台可见、前台不展示)⇒ 奖励物不与商城在售商品混淆。
> **递减与封顶的表达**:阶梯按 `seq` 递增,越后面的档越贵重;**每事件的档位总数即封顶**(例如只配 3 档 ⇒ 第 4 个被招募者起不再产生新档位奖励)。
> 「递减」指**同一档位可给的次数递减**:第 1 个被招募者达标给足,第 2、3 个起数量递减(数量写在 `qty`,后台逐档配置)。

**③ 奖励发放台账** `raf_reward_grant`(幂等 + 观察期状态机)

```sql
CREATE TABLE `raf_reward_grant` (
  `id`            BIGINT      NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT      NOT NULL COMMENT '获奖站点用户 id',
  `event`         VARCHAR(32) NOT NULL COMMENT 'raf_milestone | raf_recruit_target',
  `ref_id`        BIGINT      NOT NULL COMMENT 'raf_recruit.id(稳定唯一锚点)',
  `tier_id`       BIGINT      NOT NULL COMMENT '命中的奖励档位 raf_reward_tier.id',
  `product_id`    BIGINT      NOT NULL COMMENT '奖励商品 id',
  `qty`           INT         NOT NULL COMMENT '发放数量',
  `rule_version`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '命中时规则版本(对账用)',
  `status`        VARCHAR(24) NOT NULL DEFAULT 'pending_observe' COMMENT 'pending_observe|review|approved|shipped|revoked|failed',
  `observe_until` DATETIME(3) NOT NULL COMMENT '观察期截止(到期才发)',
  `flag_reason`   VARCHAR(64) NULL COMMENT '命中的风控信号(仅打标不拦;进人工复核)',
  `order_id`      BIGINT      NULL COMMENT '回引零元发货单 shop_order.id',
  `target_guid`   INT UNSIGNED NULL COMMENT '发往哪个角色 guid',
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `shipped_at`    DATETIME(3) NULL,
  `revoked_at`    DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grant` (`user_id`, `event`, `ref_id`) COMMENT '同一关系同一事件只发一次',
  KEY `idx_observe` (`status`, `observe_until`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 奖励发放台账(幂等+观察期状态机)';
```

> 幂等**不靠** `point_transaction`(它连 `(refType,refId)` 唯一约束都没有),靠这张台账的 `uk_grant`(同 `badge_grant` 思路)。

**④ 零元发货单**:`shop_order` 加一列 `source VARCHAR(16) NOT NULL DEFAULT 'shop'`(值 `shop` / `raf_reward`),
奖励发放走**订单状态机**:`point_cost = 0`、`status` 直接进 `paid` → 现有发货驱动 → `delivering` → `completed`;
失败进 `delivery_failed` → 重试 + 飞书告警 + 人工补发(宪法 III)。
后台订单列表按 `source` 区分,不把零元奖励单混进销售统计。

**⑤ 不涉及积分**:奖励**不用积分**(C10)⇒ **不新增** `PointTxType` 枚举值、**不动** `point_rule`、**不写**积分流水。
连带收益:省掉一次 MySQL ENUM 迁移(枚举加值要先收敛旧值再 `MODIFY COLUMN`),也避免「赠送积分稀释赞助收入」。

**⑥ 发放对象映射**

- 招募人 ⇒ 关系行的邀请码 ⇒ 查业务库该码的 `owner_user_id`(一步到位);
- 被招募人 ⇒ 关系行的 `RecruitAccount` ⇒ 需补一个「游戏账号 → 站点用户」**反查**原语(现有 `getSiteUsername` 只有正向)。
- 发往哪个角色:
  - 被招募人 ⇒ 固定发到 `raf_recruit.RecruitGuid`(就是被招募的那个角色,无需选择);
  - 招募人 ⇒ **由招募人自己选**(账号下多个角色,奖励只有一个收件角色)⇒ 待发状态下在 RAF 页选,默认其**等级最高**角色;未选则不生成发货单,页面持续提示待选择。

### 5.3 招募流程(两段式,C7)

```
【第一段 · 门户】(注册即预登记,零额外操作)
 1. A 打开门户 /account/raf → 点「获取我的专属链接」
    → 门户生成专属码(随机、去混淆字符集、限次、可轮换),业务库记「属 A」
 2. A 把链接发给 B:https://lokta.cn/register?ref=ABC123
 3. B 点链接注册 → 门户接受 invitation_code(本次起真正消费)
    → 门户校验码:raf_scope=专属码 / available / 未过期 / 未超次数
    → 业务库该码 used_count+1(次数口径唯一在业务库)
    → 写共享库 raf_referral_pending(码 X → B 的账号,state=pending)
    ※ 此时**不建立招募关系、不产生任何奖励**;注册接口原本忽略该字段,本次改为「接收并预登记」

【第二段 · 游戏端】(建号后转正,须有真实角色)
 4. B 建游戏角色进游戏
    → 游戏端读 raf_referral_pending(B 的账号)命中 pending 行
    → 游戏端**不验码**(码的有效性在登记时已由门户定过;游戏端无码表)
    → 游戏端写 raf_recruit 关系行(A 招募 B)⇒ 关系成立
    ※ 玩家**无需再输码**(体验接近「注册即归因」),但必须有真实角色(防作弊)

【补录入口 · 门户】(给漏登记者自助,仍是门户侧动作)
 5. B 在 /account/raf 点「我注册时没填码,现在补绑」→ 输入 A 的码
    → 门户校验同一个码 → 写 raf_referral_pending(B 的账号)
    → 游戏端下次触发时转正(与第 4 步同路径)
    ※ 不做游戏内 NPC/道具输码入口——那要求游戏端持有码表(副本),代价大于收益

【判定 · 游戏端】(规则表现读;游戏端**只判达标,不碰奖励**)
 6. 角色升级 ⇒ 游戏端读 raf_activity_rule(等级门槛/在线时长门槛/目标数/时间窗/规则版本)
    → 达标 ⇒ 关系行 milestone/state 更新,记 MilestoneLevel + OnlineMinutes + MilestoneAt + RuleVersion
    ※ 游戏端**不发奖、不认识奖励** ⇒ 改奖励不用动游戏端脚本(C11)

【发奖 · 门户】(待发 → 观察期 → 复核 → 零元发货)
 7. 门户读到「已达标」→ 命中奖励档位 → 台账落一行 status=pending_observe,observe_until = 达标时刻 + ObserveDays
 8. 观察期到期(cron 日频扫 + 页面惰性)→ 逐条过闸:
    · 该账号注册满 AccountAgeDays(3 天)?(冷静期,门户按站点用户注册时刻判;同一道闸同时用于「计入招募目标」)
    · 累计在线时长 ≥ OnlineMinutes?(门户只读游戏端落的时长)
    · 命中风控信号?(同 IP/同 C 段聚集 / 邀请图谱星型)⇒ 打标 flag_reason
      ├ 无信号 ⇒ status=approved
      └ 有信号 ⇒ status=review(转运营人工复核;通过则 approved,否则 revoked)
 9. approved ⇒ 生成零元发货单(source=raf_reward, point_cost=0, status=paid)→ 现有发货驱动 → SOAP 发货
    → completed;失败 ⇒ delivery_failed + 重试 + 飞书告警 + 人工补发(宪法 III)
    → 台账 status=shipped,回引 order_id
```

### 5.4 防作弊清单(落到具体机制)

> 行业共识(研究结论):**入口不拦人,在发奖口拦人**——入口拦会误伤真实拉新;出口拦(延迟发放 + 打标 + 到期判定)成本低、可观察、可回滚。
> 信号类(同 IP / 同 C 段 / 邀请图谱)**只打标不拦**,进人工复核。

| 风险 | 机制 | 落点 | 强度 |
| --- | --- | --- | --- |
| 枚举码 | 随机码(去混淆字符集)、限次(`max_uses`)、可禁用、可轮换 | 门户生成 | 高 |
| 一码多归 | `uk_recruit_account`(一个账号一生只被招募一次) | 游戏端写表时 | 高(库层) |
| **自邀/小号刷量** | **等级门槛 + 累计在线时长门槛**:脚本能拉等级,骗不了真实在线 ⇒ 小号成本＝真实在线成本 | 规则表(`MilestoneLevel` / `OnlineMinutes`) | **主闸** |
| **工作室批量养号** | **新号冷静期 3 天**:账号注册满 3 天其贡献才计入招募目标、也才允许发奖(门户按站点用户注册时刻判)⇒ 批量流水线要养号,成本按批量放大;真人拉朋友通常隔好几天才注册,不误伤 | 规则表(`AccountAgeDays`),门户判定 | **主闸** |
| **达标即领奖(套利窗口)** | **观察期延迟发奖 7 天**:达标后先挂「待发」,到期无异常才发 ⇒ 给风控留观察窗口,顺带获得「不发/回收」能力 | 规则表(`ObserveDays`),门户判定 | **主闸** |
| 批量同源注册 | 同 IP / 同 C 段聚集、邀请图谱星型(一个招募人拉了过多账号)⇒ **只打标** + 进人工复核队列,**不硬拦**(避免误伤网吧/宿舍/家庭共用 IP) | 门户侧统计 + `flag_reason` | 中(事后) |
| 重复发奖 | 门户:`uk_grant` 台账 + 零元发货单状态机;游戏端:关系行幂等标记 | 两侧各自闸 | 高 |
| 码被转卖/共用 | 限次 + 可禁用 + 可轮换 + 一码一账号(库层) | 门户 + 游戏端 | 中 |
| 奖励被套现 | 奖励全部是**拾取绑定、不可交易**的游戏内物品;**不用积分**(不碰赞助收入);可交易性由物品自身绑定属性保证 | 商品选型(运营核对) | 高 |
| 无限拉人套利 | 阶梯递减 + 每人每活动封顶一次 + 超额不计 | 奖励档位配置 | 中强 |
| 发放失败被吞 | 走订单状态机:失败进重试 + 飞书告警 + 人工补发(宪法 III) | 门户 | 高 |

> 结论:**奖励解锁的主闸是「真实游戏时长 + 冷静期 + 观察期」这三重时间成本**,不是绑定动作本身。
> 绑定动作的防作弊价值在于「必须有一个真实角色参与」,这正是两段式保留游戏端环节的理由。
> 冷静期 + 观察期 ⇒ 天然具备「不发/回收」能力,原先「MVP 不做人工撤销」的缺口被观察期补上。

### 5.5 时间与状态口径

- 时间一律 **UTC 存储**、展示走 `lib/format.ts`(AGENTS 规则 31);游戏端 Lua 写 `DATETIME` 必须 UTC,脚本评审逐条核;
- 状态枚举两侧同源同字面量(放 `src/constants/raf.ts`:**只放枚举与文案映射,不放规则数值**——规则数值在规则表);
- 门户只读展示,不写任何事实面字段。

---

## 6. 门户侧设计

### 6.1 模块与边界

新建域目录 `src/server/services/raf/`(跨业务库 + 游戏库 + 商城发货的独立域;按 AGENTS 目录规范,新增域须先在 AGENTS.md 登记):

| 文件 | 职责 |
| --- | --- |
| `services/raf/rules.ts` | 规则读写(共享库那一张)+ 版本快照 + 审计 + 回滚 + 门槛字段 |
| `services/raf/codes.ts` | 专属码生成/自助领取/禁用 + **登记时校验并写预登记行**(码的有效性只在业务库判定) |
| `services/raf/rewards.ts` | 奖励档位读取 + 台账状态机(待发/观察期/复核/已发/已收回)+ **零元发货单生成**(复用商城发货链路) |
| `services/raf/risk.ts` | 风控信号计算(同 IP / 同 C 段聚集 / 邀请图谱星型)→ **只打标**,产出 `flag_reason` |
| `services/raf/view.ts` | 本人视角投影(归属校验 + 角色维度隔离 + 降级态 + 奖励状态展示) |
| `services/shared/raf-store.ts` | 共享库读写的**唯一**出口(配置面写 / 事实面读),便于统一限制写表范围 |

依赖方向:`raf → shared`(game-identity / audit / site-identity)、`raf → catalog`+`raf → orders`(发奖复用商城的商品与发货链路;
须在 `eslint.config.mjs` 的 `ORCHESTRATION_EDGES` 登记 `raf: ["catalog", "orders"]`),
`catalog` / `orders` **不得**反向引 `raf`(单向,防循环)。
**不再依赖 `points`**——奖励不用积分(C10)。

### 6.2 降级矩阵

| 情形 | 识别 | 门户行为 | HTTP |
| --- | --- | --- | --- |
| eluna **未配置** | `getElunaDb()` → `null` | 空态:「活动未开启」;后台规则页:「未接入活动库,暂不可配置」 | 200,`enabled:false` |
| **已配置但连不上** | 探针抛错 | 错误面板(琥珀色 `role="alert"`,沿用 characters 页样式) | 503,`GAME_DB_UNAVAILABLE` |
| **表不存在**(库/脚本未部署) | MySQL 1146 | 空态 | 200,`enabled:false` |
| 有库有表但**无数据** | 查询空 | 空态:「暂无招募记录」 | 200,`enabled:true` |
| **规则表不可达** | 同「连不上」 | RAF 页仍可展示游戏端已落库的结果;后台规则页不可改并明示 | 页 200 / 后台 503 |
| 其它错误 | 兜底 | 错误面板 | 503 |

> 「未配置」与「配错」必须分开(规则 38);「表不存在」是常态不是故障。

### 6.3 API 契约

`GET /api/account/raf?guid=<角色 guid>`(缺省 = 本人第一个角色,按等级倒序)

```jsonc
{
  "enabled": true,
  "activity": {
    "targetCount": 3, "milestoneLevel": 10, "onlineMinutes": 300, "recruiterMinLevel": 30,
    "accountAgeDays": 3, "observeDays": 7, "status": "active",
    "startAt": "2026-11-20T00:00:00.000Z", "endAt": "2026-12-20T00:00:00.000Z",
    "ruleVersion": 7
  },
  "character": { "guid": 12345, "name": "阿框", "level": 60 },
  "progress": { "recruited": 2, "target": 3, "rewarded": 1 },
  "recruits": [
    { "guid": 22222, "name": "新兵", "level": 12, "state": "pending", "milestone": 0, "joinedAt": "..." }
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
| 503 | `GAME_DB_UNAVAILABLE` | 共享库不可达 |

### 6.4 前台页面(`/account/raf`)

```
角色切换(本人角色列表,默认第一个)
├─ 招募进展卡:已招募 X / 目标 Y + 进度条 + 活动状态徽标
├─ 被招募者明细:角色名 / 等级 / 状态(待达标|已达标观察中|已发奖|已失效)/ 加入时间
├─ 奖励卡:奖励名 + 状态(待达标|观察期至 X 日|已发放)+ 发往哪个角色
│    （被招募人=固定其本人角色;招募人=待发时可选自己的角色,默认等级最高）
├─ 专属链接卡:码 + 链接 + 「复制链接」+「获取我的专属链接」(已领过则展示现有码)
├─ 补录入口(仅当该账号无归属关系时出现):「我注册时没填码」→ 输码补登
└─ 玩法说明:专属链接→注册(自动预登记)→建号进游戏自动转正→达等级与在线时长→双方拿奖
```

口径:时间走 `lib/format.ts`;颜色走语义 token(禁 arbitrary-hex,规则 26④);`target=0` 时进度条按 0 宽(不除零);
错误面板沿用 characters 页样式;状态徽标复用既有徽标组件思路,不另造第二套。

### 6.5 后台(`/admin/raf/rules`)

**页一 · 活动规则**(共享库那一张表)

- 一页改:目标人数 / 里程碑等级 / 在线时长门槛 / 招募人等级门槛 / 新号冷静期天数 / 观察期天数 / 起止时间 / 活动状态;
  **整页唯一「保存」按钮**(规则 15⑤);
- 保存后:写共享库那一张规则表 + 写版本快照 + 审计 + `RuleVersion+1` ⇒ **游戏端立刻读到新值**(同库,零延迟);
- 展示:当前版本号、最后修改人/时间;提供「版本历史」列表 + 「回滚到此版本」(回滚＝以旧快照新建版本,历史完整保留);
- 共享库不可达时:页面明示「活动库不可达,暂不可改」,不报错崩页。

**页二 · 奖励档位**(`/admin/raf/rewards`)

- 阶梯配置:事件(达标/招满)× 序号 × 奖励商品(从商城商品里选,含隐藏商品)× 数量;启用开关;
- 奖励内容**只存在这里**(游戏端不认识奖励)⇒ 改奖励不用动游戏端脚本。
- **具体物品不在设计期定死**:品类按「容器背包 → 变装/幻化外观 → 坐骑」逐层递进,实际物品由运营在后台选定;
  选品时**逐条核对绑定属性**(须为拾取绑定、不可交易——这是「不可变现」的唯一保证,系统无法自动判定的部分靠人工核对)。
- 阶梯总数即**每人每活动的封顶**:只配 3 档 ⇒ 第 4 个被招募者起不再产生新档位奖励;数量递减逐档配在 `qty`。

**页三 · 复核队列**(`/admin/raf/review`)

- 列出 `status=review` 的待发奖励:关系双方、命中的信号、观察期到期时间;操作:通过(转 approved 继续发) / 收回(转 revoked);
- 操作留审计(谁、何时、通过还是收回)。

---

## 7. 里程碑拆分与验收标准

| 段 | 内容 | 前置 | 验收标准 |
| --- | --- | --- | --- |
| **N1-0 共享库就位** | 游戏侧主机建 `acore_eluna` 库 + 4 张表 + 授权(门户:配置面写/事实面只读;游戏端:事实面写/配置面只读) + `gamedb.eluna` 指向 | DBA/游戏侧运维 | ① 门户与游戏端均能连接;② 写权限按表隔离(门户写不了 `raf_recruit`) |
| **N1-a 规则与后台** | 规则表 CRUD + 版本快照 + 审计 + 回滚 + 后台页 + 等级门槛字段 | N1-0 | ① 后台改规则即生效且版本+1;② 版本历史可查可回滚;③ 审计含改动前后值;④ 游戏端读到的就是同一张表 |
| **N1-b 邀请码与预登记** | 邀请码扩展列 + 玩家自助领码 + 注册接口「接收并预登记」+ 补录入口 | N1-a | ① 玩家可自助领专属码,重复领取幂等;② 注册带码即预登记,一条账号只有一条;③ 通用码不参与游戏内绑定;④ 码次数在登记时扣减,只在业务库判定 |
| **N1-c 游戏端脚本** | 建号后转正 + 读规则判里程碑 + **统计游戏内在线时长** + 回写达标标记(**只判定、不发奖**) | N1-b + 游戏端排期 | ① 预登记账号建号后自动转正;② 一码多归被 UNIQUE 挡住;③ 达标判定按当前规则表(改规则免发版即生效);④ 达标记录带规则版本与在线时长;⑤ **游戏端不接触任何奖励内容**(奖励只配在门户) |
| **N1-d 门户展示** | RAF 页读真实数据 + 角色维度隔离 + 降级矩阵 + 专属链接 + **奖励卡(名称/状态/发往哪个角色可改)** | N1-b(有数据源) | ① 页面不再硬编码 0;② 越权 guid → 403 + 审计;③ 降级各态正确;④ 时间走 `lib/format.ts`;⑤ 奖励卡显示「待发 / 观察期 / 可发 / 已发 / 已收回」五态 |
| **N1-e 门户发奖** | 奖励档位表(`raf_reward_tier`) + 发奖台账(`raf_reward_grant`,唯一键防重) + **观察期延迟发奖** + 冷静期/在线时长闸 + **人工复核队列** + **零元发货单**(复用订单状态机 + SOAP 发货) + 风控只打标(`risk.ts`) + cron 兜底扫描 | N1-c | ① 同一关系同一事件只发一次(库层唯一键);② 观察期未到**绝不发**;③ 冷静期/在线时长不达标 ⇒ 转人工复核而非直接发;④ 零元单走通 `paid→completed`;⑤ 发货失败进重试 + 飞书告警 + 人工补发;⑥ 复核队列通过/收回均留审计 |

依赖:`N1-0 → N1-a → N1-b → N1-c → N1-e`;`N1-d` 依赖 `N1-b`,可与 `N1-c` 并行。

**发奖段的通道分工**(C11,单一口径):

```
游戏端:只判定「达标」+ 记在线时长 + 写事实面(raf_recruit)
        ↓ 达标事件(游戏端落库)
门户:  台账建待发记录 → 观察期计时 → 过闸(冷静期/时长/风控信号)
        ↓ 通过 ⇒ 生成零元发货单(point_cost=0, source='raf_reward')
门户:  走既有发货驱动 → SOAP 发货 → completed / delivery_failed(重试 + 告警 + 人工补发)
```

奖励**内容**只配在门户后台 ⇒ 改奖励**免游戏侧发版**;游戏端脚本**不含任何物品 ID、也不发任何物品**。

---

## 8. 测试策略

| 层 | 覆盖 | 说明 |
| --- | --- | --- |
| 单元 | 状态枚举→文案映射、进度百分比边界(`target=0`、超额)、台账幂等键构造、规则版本递增、**发奖闸门判定**(冷静期未过/在线时长不足/观察期未到 ⇒ 不进入可发态)、奖励档位排序 | 门户**不判定**里程碑(游戏端判)但**判定发奖闸门** ⇒ 单测集中在闸门矩阵 |
| 集成(业务库真库) | 规则保存→版本快照→审计→回滚;**台账幂等**(同 `uk_grant(user_id,event,ref_id)` 发两次只生成一条);**零元发货单**落库(`point_cost=0`、`source='raf_reward'`、状态推进 `paid→delivering→completed`);发货失败 ⇒ `delivery_failed` + 重试可观测 | 用业务库跑真迁移 |
| 集成(共享库) | 预登记唯一性、配置面/事实面写权限隔离(门户写 `raf_recruit` 必须失败)、**规则表读取即生效**(改值后游戏端读到的即新值) | 测试栈建同构库与表 |
| E2E | `/account/raf` 空态与有数据;后台改规则(版本+1);**后台改奖励档位免游戏侧发版**;**复核队列**通过/收回;越权 403;注册带码 → 预登记;**奖励卡五态**渲染 | 测试栈自带 fixture |
| 守卫 | ① `raf` 域**不得**直写 AC 四库;② 共享库的写操作**只允许**配置面 3 张表;③ 规则数值**不得**进 `src/constants/`;④ **发奖幂等不得依赖流水唯一性**(流水无 `refType/refId` 唯一键,幂等在台账);⑤ **`raf` 域不得引用积分**(奖励不走积分,避免绕回老口径);⑥ **游戏端脚本产物不得含物品 ID**(奖励只在门户配置) | 参照 `tests/unit/mcp-tools.test.ts` 的接线守卫写法 |

**测试栈前置**:E2E 覆盖真实读路径,测试栈须建 `acore_eluna` 库 + 4 张表 + 种子数据,并让测试栈 `gamedb.eluna` 指向它。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 游戏端脚本迟迟不落地 | N1 只剩后台规则页与空态页 | 按 N1-0→N1-a→N1-b→N1-d 推进,门户侧不阻塞;游戏端排期是 N1-c/N1-e 的唯一外部依赖 |
| **门户写共享库配置面** = 跨边界写 | 与宪法 V「游戏库只读」字面冲突 | `acore_eluna` 是**站点方自建库**(非 AC schema);按表分工隔离(门户只写配置面 3 张);须在 AGENTS.md 登记例外与「写权限按表隔离」的要求 |
| 共享库不可达时改不了规则 | 运营临时改不动参数 | 页面明示不可改 + 告警;活动库故障时停止发放是安全侧(宁可不发,不可发错) |
| 活动规则不在门户备份范围 | 规则库损坏需重建 | 规则是可重建的活动配置;重建路径=后台改一次即产生新版本 |
| 端口径漂移 | 页面数字与实际发奖不一致 | 门户只读游戏端落库结果,不自行判定;发奖记录带 `RuleVersion` 可对账 |
| 刷奖励(自邀/小号/一码多归/批量注册) | 奖励被套利 | 一账号一归属(库层唯一键)+ **在线时长门槛**+ **新号冷静期 3 天**+ **观察期延迟发奖**+ **人工复核队列**+ 阶梯递减 + 每人每活动封顶;信号类(同 IP/同 C 段/邀请图谱星型)**只打标不拦** |
| **观察期延迟发奖引发投诉** | 玩家认为「达标了却没发」 | 奖励卡明确显示「观察期至 X 日」与剩余条件;门槛值(冷静期/时长/观察期)后台可调;提前达标不足观察期**只延后不发**,不静默 |
| **在线时长门槛的统计口径** | 游戏端在线时长与门户理解不一致 | 时长由**游戏端统计并落库**,门户只读门槛值;口径(累计分钟、自然日切分)在规则表旁注明;门户**不自行推算** |
| 奖励「拾取绑定不可交易」依赖运营核对 | 若物品实际可交易,变现路径未清零 | 发放前在后台逐条核对物品的绑定属性;SOAP 发货链路的物品由运营从商城现有物品中挑选;发现可交易物品即从奖励档位移除并记录 |
| 复核队列积压 | 玩家等待过久 | 队列页显示待复核数与停留时长;观察期到期量应远小于达标总量;积压超阈值进飞书告警(规则 37 口径) |
| 越权查看他人招募数据 | 隐私泄漏 | 归属校验前置于查询,越权 403 + `OWNERSHIP_VIOLATION` 审计 |
| 邀请码两套用途混淆 | 运营与玩家困惑 | 合并为一套表 + `raf_scope` 区分;通用码不参与游戏内绑定;**码真身只在业务库,游戏端不读码** |
| 漏登记者无法自助补绑 | 玩家要联系客服 | 门户 RAF 页提供补录入口(门户校验码 → 写预登记),不进游戏内做 |
| 「游戏账号 → 站点用户」反查缺失 | 被邀请方奖励发不出 | 新增反查原语(入 `services/shared/game-identity`) |
| **零元发货单被当成真订单** | 财务口径被污染 | `shop_order.source='raf_reward'` + `point_cost=0` 双重标记;订单列表按来源可筛;积分流水**不产生任何记录**(奖励不走积分) |

---

## 10. 待决问题(带建议默认值,需拍板后冻结)

> 已拍板(2026-11-20 核对):**第 5、6 项**——通用码不参与游戏内绑定;补录入口放门户 RAF 页自助(不做游戏内 NPC/道具输码)。
> 第 4 版追加拍板(奖励与防作弊):**奖励取消积分**(改游戏内绑定物品:容器背包 → 变装/幻化外观 → 坐骑);**发奖走门户统一发货**(零元单,游戏端只判定不发奖);**新号冷静期保留 3 天**;**观察期延迟发奖**;**游戏内在线时长门槛**;**人工复核队列**;信号类风控只打标不拦。
> 其余 8 项按建议默认值冻结,实施前如有异议再改(均可在后台调整,不需改代码)。

| # | 问题 | 建议默认 | 状态 |
| --- | --- | --- | --- |
| 1 | 等级门槛默认值(被招募者达标等级 / 招募人领「招满」奖的等级) | 10 级 / 30 级(可后台改) | 待确认 |
| 2 | 目标招募人数默认值 | 3 人(可后台改) | 待确认 |
| 3 | 里程碑是否只支持「被招募者达等级」一种 | 只支持一种;多里程碑需加列或存 JSON,会拖慢游戏端脚本 | 待确认 |
| 4 | 专属码粒度 | 每活动每人一个,可随时轮换(旧码即失效) | 待确认 |
| 5 | 通用码(后台批量生成)是否允许游戏内绑定 | 不允许(无招募人,绑了无归属);游戏端本就不读码 | **已拍板** |
| 6 | 绑定备入口形态 | 门户 RAF 页「补录」入口(不设游戏内 NPC/道具输码——那要求游戏端持码表副本) | **已拍板** |
| 7 | 码的可用次数 | 专属码 1 次(一人一码一绑定);通用码沿用后台配置 | 待确认 |
| 8 | `acore_eluna` 建库与授权的执行方 | 游戏侧运维/DBA(本仓只提供 DDL 与授权清单) | 待确认 |
| 9 | 生产 `gamedb.eluna` 的最终指向 | 指向游戏侧新建的 `acore_eluna`(由维护方手工处理) | **由维护方处理** |
| 10 | 是否要「游戏内发奖物品明细」表(对账到物品粒度) | 本版不记(台账记目标商品与订单 id 即可对账);要时再加一张事实表 | 待确认 |
| 11 | **奖励是否用积分** | **不用积分**(积分是站点赞助收入,赠送会削弱赞助)⇒ 全部改游戏内物品 | **已拍板** |
| 12 | **发奖通道** | 门户统一发(零元发货单走既有 SOAP 发货链路);游戏端只判定达标、不发奖 | **已拍板** |
| 13 | **新号冷静期** | 保留 3 天(账号创建至允许计入招募的最短间隔) | **已拍板** |
| 14 | **观察期(延迟发奖)** | 7 天(达标后再等 7 天才进入可发态;期间可被复核拦下) | **已拍板** |
| 15 | **游戏内在线时长门槛** | 累计 300 分钟(值随规则表 `OnlineMinutes` 走,后台可改) | **已拍板** |
| 16 | **人工复核队列** | 命中风控信号或闸门未过 ⇒ 进队列由人工通过/收回,不自动发 | **已拍板** |
| 17 | **信号类风控是否拦人** | 不拦,只打标(同 IP / 同 C 段 / 邀请图谱星型)⇒ 避免误伤真实拉新 | **已拍板** |
| 18 | **奖励阶梯具体物品** | **不在设计期定死**——由运营在后台「奖励档位」页从商城商品(含隐藏商品)中选定,品类为「容器背包 → 变装/幻化外观 → 坐骑」,全部**拾取绑定、不可交易**;选品时逐条核对绑定属性 | **已拍板(品类 + 配置方式)·物品待运营配置** |

---

## 11. 文档回写清单

| 文档 | 改动 |
| --- | --- |
| `docs/README.md` | 索引表新增本文件(第 4 版:奖励取消积分 + 发奖走门户统一发货) |
| `docs/requirement/02-功能规格说明书.md` | §3.4 RAF 行补指向本方案;§3.4.1 口径要点按第 4 版改写(奖励=游戏内绑定物品、门户零元发货、防作弊组合闸) |
| `docs/plan/development-plan.md` | N1 状态与依赖关系按 N1-0～N1-e 改写;N1-e 口径改「门户发奖(观察期 + 台账 + 零元发货 + 复核队列)」 |
| `AGENTS.md` | ① 登记新域 `services/raf/`(目录规范 2);② 登记 `acore_eluna` 共享库例外与「配置面/事实面」写权限隔离(宪法 V 附近);③ 登记 `raf → catalog/orders` 编排边(**无 `raf → points`**);④ 登记「奖励 = 商城能力的投影,发奖走既有发货链路」口径(规则 35① 同原则);⑤ 登记「奖励不用积分」及其后果(不动 `PointTxType`/`point_rule`) |

---

## 附录:代码事实索引(便于复核本文结论)

| 结论 | 复核位置 |
| --- | --- |
| RAF 页是静态硬编码、API 是空态桩 | `src/app/(account)/account/raf/page.tsx`、`src/app/api/account/raf/route.ts` |
| eluna 是可选依赖(未配置→`null`,自检跳过) | `src/lib/db/eluna.ts`、`src/lib/db/index.ts`、`src/lib/config.ts` |
| eluna 可在后台擦空清除 | `src/server/services/settings/schemas.ts`(`masked-clearable`) |
| 归属校验与越权审计先例 | `src/server/services/account/restore-items.ts`、`src/server/services/shared/game-identity.ts` |
| 503 错误面板先例 | `src/app/(account)/account/characters/page.tsx` |
| 邀请码状态机与码值形态 | `src/constants/invitation.ts` |
| 积分规则表驱动 + 缺行不发 | `src/server/services/points/rules.ts`、AGENTS 规则 28(**本方案不用积分**) |
| 幂等台账先例(唯一键 + 关联流水) | `prisma/schema-business/schema.prisma`(`badge_grant`)、`src/server/services/shared/ledger.ts`(**台账为幂等真相源,流水无 `refType/refId` 唯一键**) |
| 发货链路可复用(零元单走同一条) | `src/server/services/shop/`(订单状态机 + `delivery.ts`)、`src/constants/soap.ts`(`SEND_ITEMS`/`TRANSMOG_ADD`)、AGENTS 规则 3 |
| 站点身份只有正向映射 | `src/server/services/shared/site-identity.ts` |
