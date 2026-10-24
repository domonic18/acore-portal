# Contract: 发货通道（soap-delivery）

**Feature**: [spec.md](../spec.md) | 覆盖 FR-116~FR-124 | 基座：M1 SOAP 命令层（client 超时/重试/幂等/审计，soap_call 表）全量复用，M2 新增**处理器注册表**与发货命令封装。

> 通道基线：开发与验收全程走 soap-mock（2026-10-24 决策）；真机联调为上线前置任务，命令名届时核对修订（research R5）。以下命令名为 AzerothCore 惯用名，mock 契约先固化。

## 处理器注册表（server/services/shop/handlers/）

```ts
interface DeliveryHandler {
  skuKey: string;                       // 精确键；itemsend_* 前缀统一由 ItemSendHandler 承接
  validateSchema: ZodSchema;            // 购物车行 params 校验（加购/结账双重把关）
  precheck?(item: OrderItemCtx): Promise<void>;   // 发货前置（如装备恢复校验服务器在线）
  execute(item: OrderItemCtx): Promise<DeliveryResult>;  // 经 soap 层执行，幂等键=item.id
}
```

- 注册表 `Map<skuKey, Handler>`；`resolveHandler(sku)`：`itemsend_` 前缀 → ItemSendHandler，否则精确匹配
- `resolveHandler` 未命中 ⇒ 商品保存被拒（FR-126）+ 发货层防御性拒绝（`DELIVERY_NO_HANDLER`）
- `OrderItemCtx` = orderItem 快照 + params + 用户游戏账号 id（经 username UPPER 约定查 auth 库）

## SKU → 处理器 → 命令映射

| SKU / 前缀 | 处理器 | 参数（params） | 服务端校验 | SOAP 命令（mock 先固化） |
|---|---|---|---|---|
| `itemsend_{id}` | ItemSendHandler | `characterGuid` | 角色归属 | `.send items --{char} "{subject}" "{text}" {id}:{count}` |
| `item-restoration` | ItemRestoreHandler | `characterGuid` + `restoreItemEntry` | 归属+可恢复列表命中+**服务器在线**（precheck，FR-120） | `.send items`（恢复物品经 send mail 执行，与用户中心恢复同源） |
| `char-change-race` | CharChangeRaceHandler | `characterGuid` | 归属 | `.character changerace {char}` |
| `char-change-faction` | CharChangeFactionHandler | `characterGuid` | 归属 | `.character changefaction {char}` |
| `char-change-customize` | CharCustomizeHandler | `characterGuid` | 归属 | `.character customize {char}` |
| `char-change-name` | CharRenameHandler | `characterGuid` | 归属 | `.character rename {char}`（玩家进游戏自改名，与旧站一致；`name-unlock` 为指定名变体） |
| `name-unlock` | NameUnlockHandler | `characterGuid` + `unlockName` | 归属+名字合法性+首字母大写规范化+占用 | `.character rename {char} {NewName}` |
| `char-transfer` | CharTransferHandler | `characterGuid` + `destAccount` | 归属+目标账号存在（auth 库） | `.character transfer {char} {destAccount}` |
| `char-clone` | CharCloneHandler | `characterGuid` + `destAccount` | 同上 | `.character clone {char} {destAccount}` |
| `guild-change` | GuildChangeHandler | `characterGuid` + `guildName` | 归属+公会名合法性（长度/字符集） | `.guild change {char} {guild}` |
| 幻化单件/套装/外观重置 | 以 itemsend_* 物品为载体（存量形态），走 ItemSendHandler | `characterGuid` | 归属 | 同 itemsend |

> 命令名/参数以 soap-mock 契约测试固化为唯一实现依据；真机联调若发现偏差，仅改 handlers 层映射并同步本表（不做双轨）。

## 发货执行流程（订单行粒度）

1. 订单 `delivering`（research R1 短瞬态）
2. 逐行 `resolveHandler(sku)` → 未命中 ⇒ 行 failed + 订单 delivery_failed + 审计
3. `precheck?` ⇒ 失败 ⇒ 行 failed（可重试）
4. `execute` ⇒ soap 层以**幂等键 = order_item.id** 提交（M1 机制：同键命中未完成调用则等待复用，已完成则直接返回既有回执——重复补发不重复发货，SC-102）
5. 回执成功 ⇒ 行 delivered + deliveredAt + soapCallId；全部行 delivered ⇒ 订单 completed + completedAt（**自动闭环**，FR-116）
6. 任一失败 ⇒ 订单 delivery_failed + deliveryError 摘要；重试队列 = `status=delivery_failed` 查询（无独立队列表，YAGNI）
7. 崩溃恢复：对账任务同周期扫描滞留 `delivering` 的订单（deliveringAt 超时阈值）重新驱动——幂等键兜底（research R1）

## 审计与可观测

- 每次调用（成功/失败/幂等命中）均落 soap_call（M1 既有：命令/参数/结果/耗时/重试计数）
- 状态迁移全部经状态机模块并写 order 状态时间戳；补发/退款/越权另记 AuditLog（契约见 api-admin）
- mock 通道：soap-mock 对每命令返回确定性回执（成功/可注入失败），E2E 依赖此契约（quickstart S3/S4）
