# 招募队友（RAF）需求方案设计

> 里程碑:二期 N1「招募队友」(见 `docs/plan/development-plan.md` N1 条目)
> 文档性质:**需求与设计基准**。写法以 **git 仓库代码事实**为准,规划文档只作参考。
> 状态:设计稿(未实施)｜编写日期:2026-11-20
> 相关:规格书 §3.4「用户中心 · RAF 招募进度」、AGENTS.md 规则 5(游戏四库只读)/ 38(可选依赖语义)/ 31(时间口径)

---

## 1. 背景与目标

老站(WordPress)有一个「招募队友(RAF)」的用户中心页面:玩家拿到专属链接,拉新玩家注册建号即建立招募关系,
被招募角色达到等级里程碑后双方获奖赏。M1 已在门户里搭好了页面骨架与 API 骨架,但**数据接口始终是空态硬编码**。

N1 的目标(沿用 development-plan N1 验收标准):

1. RAF 页展示**真实招募数据**,不再是硬编码零值;
2. **角色维度隔离**——只展示当前所选角色的招募进度,不串号;
3. 游戏端脚本未产出数据时**明确空态而非报错**;
4. 依赖的 eluna 库缺失**不拖垮门户**(降级而非启动自检失败)。

本方案把 N1 拆成「门户侧可独立完成」与「依赖游戏端脚本」两段,并在动手前把**数据契约**定死——
因为写入方在游戏侧,契约一旦含糊就会变成两端口径漂移。

---

## 2. 现状(代码事实)

### 2.1 门户侧已就位的骨架

| 位置 | 事实 |
| --- | --- |
| `src/app/(account)/account/raf/page.tsx` | M1 静态页:标题「RAF 招募」+「已招募 0 人」硬编码 + 玩法说明三行(专属链接→注册建号→里程碑→双方奖励) |
| `src/app/api/account/raf/route.ts` | M1 桩:登录校验后 `apiOk({ recruited: [], total: 0 })`,注释「数据 M2 接入」 |
| `src/constants/navigation.ts` | `ACCOUNT_NAV` 含 `{ href: "/account/raf", label: "RAF 招募" }`(入口已在,无需加) |
| `prisma/schema-eluna/schema.prisma` | eluna client 只有 `ConnectionProbe`(`@@ignore` 占位),**无任何业务模型** |
| `src/lib/db/eluna.ts` | `getElunaDb()`:未配置返回 `null`;已配置则建连并缓存(`resetElunaDb()` 支持热重置) |
| `src/lib/db/index.ts` | 启动自检里 eluna 探针:未配置→`skipped`(不算失败),配了却连不上→`ok=false`(fail-fast) |
| `src/lib/config.ts` | `gamedb.eluna` 为 `z.string().url().optional()`;`flattenToSchema` 把「缺行/空串/纯空白」归一为 `undefined`(未配置) |
| `src/server/services/settings/schemas.ts` | `gamedb.eluna` 敏感模式 `masked-clearable`(可擦空清除),其余三库为必需依赖 `masked` |
| `src/server/services/shared/game-identity.ts` | 已有 `resolveGameAccountId` / `listOwnCharacters` / `characterOwnedBy` / `GameDbError`(游戏库不可达上抛,调用方转 503) |
| `src/server/services/account/restore-items.ts` | 归属校验 + 越权审计(`OWNERSHIP_VIOLATION`)的既有先例 |
| `src/app/(account)/account/characters/page.tsx` | `GameDbError` → 琥珀色错误面板(不白屏)的既有先例 |

### 2.2 游戏侧实况(2026-11-20 只读核实)

| 事实 | 影响 |
| --- | --- |
| 游戏侧 MySQL 主机只有 `acore_auth` / `acore_characters` / `acore_world` 三个库,**没有 eluna 库** | 「读 eluna 库」的前提尚不存在,游戏端需先建库/建表 |
| `acore_characters` 里的 `character_social` 是 AC 标准好友表(guid/friend/flags/note,非空),**不是招募关系表** | 不可拿它当 RAF 数据源;需自定义表 |
| 门户生产 MySQL 里已存在 `acore_eluna` 库,但**一张表都没有** | 该库是空壳,读不出任何 RAF 数据 |
| 生产 `gamedb.eluna` 指向门户**自身** MySQL 容器内的 `acore_eluna` | 生产容器不发布 DB 端口(AGENTS 规则 10⑥)、且库在门户容器网络内 ⇒ **游戏端写不进去** ⇒ 此落点与「游戏端写、门户只读」冲突 |
| 游戏侧 `acore_characters` 已有门户只读的自定义表先例(`recovery_item`,生产模块表) | 「游戏侧自定义表 + 门户只读」这条路是既成做法,不是新模式 |

> 生产 `gamedb.eluna` 的最终指向由维护方**手工**处理(不在本方案范围);
> 本方案只负责把「门户需要一个可写的游戏侧落点」这一前置项写清楚。

### 2.3 另一处「邀请码」:不要与 RAF 招募码混为一谈

仓库里已存在一套**门户邀请码**(`src/constants/invitation.ts`:前缀 + 随机段、`available/disabled/finish` 状态机、
`expired` 实时推导不落库),后台可批量生成与禁用。但注册接口 `src/app/api/auth/register/route.ts` 的注释明写:
「M1 注册不要求邀请码,`invitation_code` 兼容接收但忽略(邀请码必填随 P2 邀请码迭代回归)」——
**门户侧目前没有任何邀请码消费方**。

⇒ RAF 招募码若与门户邀请码并存,会出现两套「码」两套校验,运营与玩家都会混淆。
本方案默认**两套并存且互不消费**(MVP 不合并),并把「是否合并」列入待决问题(§10)。

---

## 3. 范围界定

### 3.1 本期做

1. **数据契约**:表结构、字段口径、写入方、幂等口径、时区口径(§5);
2. **门户侧读模型**:服务层读游戏侧 RAF 数据 + 本人视角投影 + 归属校验 + 降级矩阵(§6.1–6.2);
3. **API 契约**:`GET /api/account/raf` 换成真实数据(§6.3);
4. **页面**:角色切换、招募进展、被招募者明细、专属链接(若游戏端已出码)、降级与空态(§6.4);
5. **测试**:单元 + 集成 + E2E 三层(§8)。

### 3.2 本期不做(明确排除)

| 不做项 | 理由 |
| --- | --- |
| 门户侧发放奖励/积分 | 奖励发放在游戏端(游戏内物品/邮件,能力与数据都在那边);门户发积分是**另起一刀**(新增 earn 事件 + `point_rule` 基线 + 幂等台账),见 §7 的 N1-c |
| 门户侧生成/消费招募码 | 生成与校验都在游戏端;门户只读展示(§4 D8) |
| 门户侧写入任何游戏侧数据 | 宪法 V:门户对游戏库唯一写路径是 `acore_auth.account` |
| 活动规则的后台可视管理 | 规则由游戏端单持(§4 D2),门户后台不持有活动配置(双份即漂移) |
| 招募排行榜 / 社交推荐 / 分享奖励 | 超出「招募进度」范围,本期不引入 |
| 邀请码体系与 RAF 招募码合并 | 待决(§10),MVP 不做 |
| 门户侧参与归因(注册时写关系) | 归因写入点在游戏端(§5.5) |

---

## 4. 归属原则(先定原则,再谈表)

| 编号 | 原则 | 依据 |
| --- | --- | --- |
| **D1** | **游戏端写、门户只读**:RAF 数据与奖励发放全在游戏端;门户只读展示 | 宪法 V(游戏四库只读);门户对游戏库唯一写路径是 `acore_auth.account` |
| **D2** | **落点必须游戏端可写**:RAF 表建在游戏侧 MySQL 主机;门户经只读连接读取。生产当前那个空的 `acore_eluna`(在门户容器内)游戏端写不进去,必须换落点 | §2.2 实况;AGENTS 规则 10⑥(生产 DB 不发布端口) |
| **D3** | **角色维度为唯一业务主键**:招募人是**角色**(guid),账号 id 冗余(便于按账号查);门户侧任何查询都必须先过归属校验 | 与既有 `listOwnCharacters` / `characterOwnedBy` 口径一致 |
| **D4** | **门户只展示、不计算**:进度、目标、里程碑达成状态**全部由游戏端算好落库**,门户只做展示映射 | 两端口径各算一份必然漂移(同 AGENTS 规则 29「状态单一出口」精神) |
| **D5** | **降级三态**:未配置 → 空态;配了连不上 → 503;表不存在 → 空态;其他错误 → 503 | AGENTS 规则 38(未配置 ≠ 配错);游戏端脚本未落地是**常态**,不是故障 |
| **D6** | **时间 UTC 存储 / 东八区展示**:游戏端写入的 `DATETIME` 一律 UTC;门户展示走 `lib/format.ts` | AGENTS 规则 31;游戏端 Lua 写时间戳最容易踩墙钟坑,必须在契约里写死 |
| **D7** | **一个账号只被招募一次**:`UNIQUE(RecruitAccount)`;招募人与被招募人同账号也拒 | 防刷奖励;校验在游戏端,门户不参与 |
| **D8** | **招募码由游戏端生成、门户只读展示**:门户拼专属链接(`app.url` + 码),校验与消费在游戏端 | 门户不写库 ⇒ 不可能自己造码;码若由门户派生则可被伪造归因 |

---

## 5. 数据契约

### 5.1 落点选择

| 方案 | 描述 | 优点 | 代价 |
| --- | --- | --- | --- |
| **A(建议)** | 在**游戏侧 MySQL 主机**新建 `acore_eluna` 库,建三张表;worldserver 的 MySQL 账号获该库写权限;门户 `gamedb.eluna` 指向它(只读) | ① 活动数据生命周期独立(开活动/清活动/换活动不动角色库);② 门户侧可选依赖通道已就位,落地后**只填连接串、不改代码**;③ 角色库是核心资产,不塞活动表 | 需 DBA 在游戏侧新建 schema 并授权(worldserver 账号) |
| B(备选) | 表建在游戏侧 `acore_characters` 库里(自定义表先例:`recovery_item`) | 零新增授权(角色库账号本就可写);门户已有只读连接,不依赖 eluna 配置 | 活动表混进角色库,牵连角色库的备份/迁移/回滚口径;语义不干净 |

**建议 A,落 B。** 两者对门户代码的接口完全一致(§6.1 的读模型是单出口),A 不通时切 B 只改读模型内部实现。

### 5.2 表结构(方案 A 的库内 DDL)

> 列名用 AC 风格的 PascalCase(`recovery_item` 先例),时间列一律 UTC(D6)。
> 三张表都**由游戏端建、门户只读**;门户不在业务库做迁移。

**① `raf_activity`**——当前活动规则,单行有效(游戏端维护)

```sql
CREATE TABLE `raf_activity` (
  `Id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `TargetCount`     INT UNSIGNED NOT NULL DEFAULT 3   COMMENT '目标招募人数',
  `MilestoneLevel`  INT UNSIGNED NOT NULL DEFAULT 10  COMMENT '被招募角色达到该等级即达成里程碑',
  `Status`          VARCHAR(16)  NOT NULL DEFAULT 'draft' COMMENT 'draft|active|closed',
  `StartAt`         DATETIME     NOT NULL             COMMENT '活动开始时刻(UTC)',
  `EndAt`           DATETIME     NOT NULL             COMMENT '活动结束时刻(UTC)',
  `UpdatedAt`       DATETIME     NOT NULL             COMMENT '最近更新时刻(UTC)',
  PRIMARY KEY (`Id`),
  KEY `idx_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 活动规则(单行有效)';
```

**② `raf_invite`**——每个招募角色一行,存其招募码(游戏端生成,门户只读)

```sql
CREATE TABLE `raf_invite` (
  `Id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `RecruiterGuid`   INT UNSIGNED NOT NULL             COMMENT '招募人角色 guid',
  `RecruiterAccount` INT UNSIGNED NOT NULL            COMMENT '招募人账号 id(冗余)',
  `InviteCode`  VARCHAR(32)  NOT NULL                COMMENT '招募码(游戏端生成与消费)',
  `CreatedAt`   DATETIME     NOT NULL                COMMENT '生成时刻(UTC)',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `uk_recruiter` (`RecruiterGuid`),
  UNIQUE KEY `uk_code` (`InviteCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 招募码';
```

**③ `raf_recruit`**——招募关系(游戏端写入,门户只读)

```sql
CREATE TABLE `raf_recruit` (
  `Id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `RecruiterGuid`   INT UNSIGNED NOT NULL                COMMENT '招募人角色 guid',
  `RecruiterAccount` INT UNSIGNED NOT NULL               COMMENT '招募人账号 id(冗余)',
  `RecruitGuid`     INT UNSIGNED NOT NULL                COMMENT '被招募角色 guid',
  `RecruitAccount`  INT UNSIGNED NOT NULL                COMMENT '被招募账号 id',
  `InviteCode`      VARCHAR(32)  NOT NULL DEFAULT ''     COMMENT '归因用的招募码(留痕)',
  `State`           VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending|active|rewarded|invalid',
  `Milestone`       INT UNSIGNED NOT NULL DEFAULT 0      COMMENT '已达成的里程碑序号(0=未达成)',
  `CreatedAt`       DATETIME     NOT NULL                COMMENT '建立关系时刻(UTC)',
  `UpdatedAt`       DATETIME     NOT NULL                COMMENT '最近更新时刻(UTC)',
  PRIMARY KEY (`Id`),
  UNIQUE KEY `uk_recruit_account` (`RecruitAccount`),
  KEY `idx_recruiter` (`RecruiterGuid`, `State`),
  KEY `idx_recruiter_created` (`RecruiterGuid`, `CreatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='RAF 招募关系';
```

`UNIQUE uk_recruit_account` 就是 D7 的落点:**一个账号只能被招募一次**(重复归因直接被数据库挡住,
游戏端需把冲突当作「已有归属」而非报错)。

### 5.3 字段口径与写入方

| 字段 | 口径 | 写入方 |
| --- | --- | --- |
| `raf_activity.Status` | `draft` 未开 / `active` 进行中 / `closed` 已结束(门户只映射文案,不改状态) | 游戏端 |
| `raf_activity.TargetCount` | 目标招募人数;门户只展示 | 游戏端 |
| `raf_activity.MilestoneLevel` | 里程碑等级;**门户不据此自行判定达成**(达成与否由游戏端写进 `raf_recruit.Milestone`) | 游戏端 |
| `raf_invite.InviteCode` | 招募码;建议 8–16 位、字符集去混淆(参考 `INVITATION_ALPHABET` 的去混淆思路) | 游戏端 |
| `raf_recruit.State` | `pending` 已建立未达里程碑 / `active` 达成里程碑待发奖 / `rewarded` 已发奖 / `invalid` 失效(如被招募方删号、违规) | 游戏端 |
| `raf_recruit.Milestone` | 已达成的里程碑序号,0 = 未达成 | 游戏端 |
| `*At` 时间列 | **UTC**;门户展示走 `lib/format.ts`(D6) | 游戏端 |

**幂等口径**:游戏端脚本对同一 `(RecruiterGuid, RecruitGuid)` 重复写入必须幂等(用
`INSERT ... ON DUPLICATE KEY UPDATE` 或先查后写);`uk_recruit_account` 是最后一道闸。

### 5.4 门户侧读什么(不读什么)

门户**只读**:`raf_activity`(单行)、`raf_invite`(当前角色一行)、`raf_recruit`(当前角色的招募关系列表)。
门户**不读不写**:被招募人的账号明细、奖励发放记录、里程碑判定过程。

### 5.5 归因链路(建立关系的写入点)

```
玩家 A(门户 /account/raf 复制专属链接)
  └─ 链接 = app.url + 注册页 + ?ref=<InviteCode>     ← 门户拼装(只读自 raf_invite)
       └─ 新玩家 B 注册(门户现有注册流程,邀请码字段当前被忽略)
            └─ B 建号进游戏,使用/携带 A 的招募码
                 └─ 游戏端脚本校验 InviteCode → 写 raf_invite/raf_recruit → 游戏端发奖
```

要点:
- **归因写入点在游戏端**,门户不参与(宪法 V);
- 新玩家**注册后需在游戏内完成一次绑定动作**(用码/NPC/道具),否则门户侧无从建立关系——
  这条是游戏端交互设计,须与脚本一并定;
- 门户的 `app.url` 来源是 `system_config` 的 `app.url`,与其它页面链接同源。

---

## 6. 门户侧设计

### 6.1 模块与依赖边界

| 模块 | 位置 | 职责 |
| --- | --- | --- |
| 数据访问 | `src/server/services/shared/raf-store.ts`(拟) | 读 `raf_activity` / `raf_invite` / `raf_recruit`;**唯一**的游戏侧 RAF 读入口(换落点只改这里) |
| 业务投影 | `src/server/services/account/raf.ts`(拟) | 本人视角组装:用户名→游戏账号→本人角色→归属校验→进度/明细投影 |

- `services/shared/*` 是跨域基础服务的归口(AGENTS 目录规范 2),游戏侧数据读取属此列;
- `services/account/*` 是账号域投影,复用既有 `game-identity` 的 `resolveGameAccountId` / `characterOwnedBy`;
- **不需要**新增 `eslint.config.mjs` 的编排边:`account → shared` 本就允许;若后续把读模型放进别的域,再登记。

### 6.2 降级矩阵(D5 的具体化)

| 情形 | 识别方式 | 门户行为 | HTTP |
| --- | --- | --- | --- |
| eluna **未配置** | `getElunaDb()` 返回 `null` | 空态:「活动未开启」,页面其余区块正常渲染 | 200,`enabled:false` |
| **已配置但连不上** | 探针抛错 | 错误面板(沿用 `characters` 页琥珀色 `role="alert"` 样式) | 503,`GAME_DB_UNAVAILABLE` |
| **表不存在**(脚本未部署) | MySQL 1146 `ER_NO_SUCH_TABLE` | 空态(脚本未落地是常态) | 200,`enabled:false` |
| 表存在但**无数据** | 查询结果为空 | 空态:「暂无招募记录」 | 200,`enabled:true` |
| 其它错误 | 兜底 | 错误面板 | 503,`GAME_DB_UNAVAILABLE` |

> 「未配置」与「配错」必须分开:把前者当后者会让可选依赖缺失拖垮门户(AGENTS 规则 38);
> 而把「表不存在」当故障,会让游戏端脚本尚未落地变成门户报错。

### 6.3 API 契约

`GET /api/account/raf?guid=<角色 guid>`(guid 缺省 = 本人第一个角色,按等级倒序)

**200**

```jsonc
{
  "enabled": true,                 // 数据源是否就绪
  "activity": {                    // 活动规则(游戏端单持,门户只展示)
    "targetCount": 3,
    "milestoneLevel": 10,
    "status": "active",            // draft | active | closed
    "startAt": "2026-11-20T00:00:00.000Z",
    "endAt": "2026-12-20T00:00:00.000Z"
  },
  "character": { "guid": 12345, "name": "阿框", "level": 60 },
  "progress": { "recruited": 2, "target": 3, "rewarded": 1 },
  "recruits": [
    { "guid": 22222, "name": "新兵", "level": 12, "state": "pending", "milestone": 0, "joinedAt": "..." }
  ],
  "invite": { "code": "K3M9QX7A", "url": "https://lokta.cn/register?ref=K3M9QX7A" }
}
```

**其它状态**

| 状态 | code | 场景 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 403 | `CHARACTER_NOT_OWNED` | guid 不属于本人(并落 `OWNERSHIP_VIOLATION` 审计,沿用 `restore-items` 先例) |
| 503 | `GAME_DB_UNAVAILABLE` | 已配置但游戏库不可达 |

未配置/表不存在时也返 **200**,但 `enabled:false` 且 `activity/recruits/invite` 为 `null`——
前端据此渲染空态而非错误页。

### 6.4 页面结构(`/account/raf`)

```
角色切换(本人角色列表,默认选第一个;沿用「我的角色」页的卡片样式)
├─ 招募进展卡:已招募 X / 目标 Y + 进度条 + 活动状态徽标(draft/进行中/已结束)
├─ 被招募者明细:角色名 / 等级 / 状态(待达成/已达成/已发奖/已失效)/ 加入时间
├─ 专属链接卡:招募码 + 完整链接 + 「复制链接」按钮(游戏端未出码时不渲染此卡)
└─ 玩法说明(沿用现有静态文案:专属链接→注册建号→里程碑→双方奖励)
```

口径:
- 时间一律走 `lib/format.ts`(AGENTS 规则 31),禁裸 `toLocaleString`;
- 颜色一律走语义 token(`text-body` / `text-muted` / `text-heading` / `border-line` / `bg-panel-strong`),
  禁 arbitrary-hex(AGENTS 规则 26④);
- 进度条宽度按 `recruited / target` 计算,`target` 为 0 时按 0 宽处理(不除零);
- 状态徽标复用既有徽标组件思路(论坛 `ThreadStatusBadge` 那种),不自造第二套标记;
- 错误面板沿用 `characters` 页的琥珀色 `role="alert"` 样式(不白屏)。

---

## 7. 里程碑拆分与验收标准

| 段 | 内容 | 前置 | 验收标准 |
| --- | --- | --- | --- |
| **N1-a 门户侧读模型(可独立完成)** | 数据契约定稿(本文档)+ `raf-store` / `account/raf` 服务层 + API 接真实数据 + 页面读库 + 降级矩阵 | 无(游戏端没落地也交付:页面恒空态但**不报错**) | ① 页面不再硬编码 0(走读模型);② eluna 未配置 → 空态 200;③ 配了连不上 → 503 面板;④ 表不存在 → 空态;⑤ 角色维度隔离(查他人 guid → 403 + 审计);⑥ 时间展示走 `lib/format.ts` |
| **N1-b 游戏端脚本落地 + 专属链接** | 游戏侧建库建表 + worldserver 授权 + Eluna 脚本写入 + 招募码生成与消费 | N1-a + DBA 授权 + 游戏端排期 | ① 真实招募关系出现在页面;② 专属链接可用(新玩家凭码建关系);③ 里程碑状态与游戏端一致;④ 重复归因被 `uk_recruit_account` 挡住且游戏端按「已有归属」处理 |
| **N1-c 门户发积分(可选,单独一刀)** | 新增 earn 事件 + `point_rule` 基线 + 幂等台账 + 发放 | 运营决策(是否要门户发奖) | ① 同一笔招募不重复发分;② 缺 `point_rule` 基线行时不发(规则 28④) |

> **N1-a 是当前唯一可立即推进的段**;N1-b 依赖游戏端与 DBA,本方案只保证门户侧不阻塞。

---

## 8. 测试策略

| 层 | 覆盖 | 说明 |
| --- | --- | --- |
| 单元(`tests/unit/`) | 展示映射纯函数:状态枚举→中文文案、进度百分比边界(`target=0`、超额)、`mask` 与时间格式化 | 门户**不计算**业务进度(D4),故单测面很小 |
| 集成(`tests/integration/`) | 读模型对「未配置 / 表不存在 / 有数据」三条路径的判定 | 真库不可得(生产那个库是空的)⇒ 用**桩库**或对 `raf-store` 打桩;断言「缺表不抛错」 |
| E2E(`tests/e2e/`) | `/account/raf` 未配置 eluna → 空态;测试栈灌 fixture 后 → 展示真实进度 | 测试栈需自带 `acore_eluna` 库 + 建表 + fixture(见下) |
| 守卫 | 读模型**禁写**游戏侧库(禁 `prisma.` 写入、禁 `@/lib/db` 直连游戏库) | 沿用 `tests/unit/mcp-tools.test.ts` 的接线守卫写法 |

**测试栈前置**:E2E 要覆盖真实读路径,测试栈 MySQL 里须有 `acore_eluna` 库 + 三张表 + 种子数据,
并在测试栈 `gamedb.eluna` 指向它(测试栈可控,生产由游戏端建)。
这条前置**不在 N1-a 的必需项里**(可先只验降级路径),但 N1-b 的 E2E 必须先补上。

---

## 9. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| 游戏端脚本迟迟不落地 | N1 交付物只剩空态页 | N1-a 独立交付;门户不因游戏端未就绪而阻塞其余功能(同 M7 搁置不阻塞 M6/M8 的先例) |
| 落点选错(生产现有一个空 `acore_eluna` 在门户容器内,游戏端写不进去) | 脚本写了但门户读不到 / 数据永远为空 | 契约明写「落点必须游戏端可写」(D2);prod `gamedb.eluna` 的指向由维护方手工处理;门户侧对「表不存在」走空态不报错,便于灰度 |
| 门户与游戏端各算一份进度 | 玩家看到的数与实际发奖不一致 | 门户只展示游戏端算好的结果(D4);门户侧不写任何进度字段 |
| 刷奖励(一个号多号互邀) | 奖励被套利 | `uk_recruit_account`(D7)+ 游戏端校验账号维度;门户不参与判定 |
| 越权查看他人招募数据 | 隐私泄漏 | 查询前过 `characterOwnedBy`,越权 403 + `OWNERSHIP_VIOLATION` 审计(沿用 `restore-items` 先例) |
| 两套邀请码并存 | 运营与玩家混淆 | 本期不合并(§2.3),但把「是否合并」列为待决(§10);文档统一叫「招募码」以区别于门户「邀请码」 |
| 游戏端写时间戳用了墙钟 | 活动时间窗/加入时间整体偏移 8 小时 | 契约里写死 UTC(D6)+ 列注释;游戏端脚本评审时逐条核 |
| 招募码被伪造归因 | 可给任意他人刷招募数 | 码由游戏端随机生成并落表(D8),门户只读;校验与消费只在游戏端 |

---

## 10. 待决问题(需人工拍板,不在本方案单方决定)

| # | 问题 | 建议 | 影响面 |
| --- | --- | --- | --- |
| 1 | RAF 表落点:游戏侧独立 `acore_eluna` 库(方案 A)vs `acore_characters` 自定义表(方案 B) | **A**;需 DBA 在游戏侧新建 schema 并给 worldserver 账号写授权 | 决定后即冻结;门户代码两案同接口 |
| 2 | 活动规则(目标人数/里程碑/时间窗)由谁持有、谁能改 | 游戏端单持(D4);运营改规则＝游戏端改表,门户自动跟随 | 若改门户后台可配,必须再定「谁是真相源」,否则漂移 |
| 3 | 奖励形态:游戏内物品(游戏端发)vs 门户积分(门户发) | 游戏内物品;门户发积分按 N1-c 单开一刀 | 决定 N1-c 是否存在 |
| 4 | 招募码与门户邀请码是否合并 | 本期不合并;若合并,须同时解决「注册接口当前忽略邀请码」的旧账 | 影响注册链路改动量 |
| 5 | 里程碑定义 | 建议只支持「被招募角色达到 N 级」一种;要多种就得加列或存 JSON,会拖慢游戏端脚本 | 表结构与脚本 |
| 6 | 招募目标是否按角色/职业区分 | 建议不区分(全局一个目标) | `raf_activity` 是否要加维度列 |
| 7 | 生产 `gamedb.eluna` 的最终指向 | 由维护方手工处理(门户容器内那个空库游戏端写不进去) | 生产可用性;与 #1 联动 |
| 8 | 新玩家绑定招募码的动作形态(用码/NPC/道具) | 游戏端交互,与脚本一并定 | 归因能否闭环 |

---

## 11. 文档回写清单

| 文档 | 改动 |
| --- | --- |
| `docs/README.md` | 索引表新增本文件 |
| `docs/requirement/02-功能规格说明书.md` | §3.4 RAF 行补指向本方案的摘要(归属原则/降级三态/不做项) |
| `docs/plan/development-plan.md` | N1 状态更新:「需求方案已定稿(N1-a/N1-b/N1-c 三段拆分),门户侧 N1-a 可立即推进」 |

---

## 附录:代码事实索引(便于复核本文结论)

| 结论 | 复核位置 |
| --- | --- |
| RAF 页是静态硬编码 | `src/app/(account)/account/raf/page.tsx` |
| API 是空态桩 | `src/app/api/account/raf/route.ts` |
| eluna 是可选依赖(未配置→`null`,自检跳过) | `src/lib/db/eluna.ts`、`src/lib/db/index.ts`、`src/lib/config.ts` |
| eluna 可在后台擦空清除 | `src/server/services/settings/schemas.ts`(`masked-clearable`) |
| 归属校验与越权审计先例 | `src/server/services/account/restore-items.ts`、`src/server/services/shared/game-identity.ts` |
| 503 错误面板先例 | `src/app/(account)/account/characters/page.tsx` |
| 门户邀请码存在但注册侧忽略 | `src/constants/invitation.ts`、`src/app/api/auth/register/route.ts` |
| 积分获取类事件须走规则表(缺行不发) | `src/constants/points.ts`、AGENTS 规则 28 |
