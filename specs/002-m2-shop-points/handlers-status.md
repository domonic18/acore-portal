# US4 服务处理器联调状态（T043，SC-106 证据）

> 通道基线：开发与验收全程走 soap-mock（contracts/soap-delivery.md 头注）。
> 下表每处理器均有 1 条 mock 实测订单，证据 = `tests/integration/handlers-delivery.test.ts`（T038）
> + `tests/unit/handlers.test.ts`（T037），`make check` 全绿（2026-10-24，115/115）。
> 幂等键统一 = `orderitem:{order_item_id}:1`（US3 attempt 后缀方案），soap_call 落库可查。

## 一、每处理器 mock 实测清单

| SKU | 处理器 | 实测命令（args） | 落库断言 | 测试 |
|---|---|---|---|---|
| `char-change-race` | CharChangeRaceHandler | `.character changerace {char}` | command 照录映射表；args=[charName]；status=success；attempts=1；params.characterGuid 落库；订单 completed、行 delivered | handlers-delivery「角色类四处理器」 |
| `char-change-faction` | CharChangeFactionHandler | `.character changefaction {char}` | 同上 | 同上（循环 4 SKU） |
| `char-change-customize` | CharCustomizeHandler | `.character customize {char}` | 同上 | 同上 |
| `char-change-name` | CharRenameHandler | `.character rename {char}` | 同上 | 同上 |
| `name-unlock` | NameUnlockHandler | `.character rename {char} {NewName}` | 全小写输入 → 落库 params.unlockName 与命令 args 均为首字母大写规范名 | handlers-delivery「名字解锁：规范化」 |
| `name-unlock`（占用） | 同上 precheck | —（支付前拦截） | CheckoutError PRECHECK_FAILED，message 含「占用」；订单数零增长（零写入） | handlers-delivery「占用名拦截」 |
> **2026-10-25 商品面收敛**:`char-transfer`/`char-clone`/`guild-change` 三 SKU 已整链移除(商品面对齐 WP 旧站,WP 从未提供;真机亦无对应原生子命令)——处理器/参数矩阵/白名单/测试均已删,加购即拒 NO_HANDLER。
| `item-restoration` | ItemRestoreHandler | `.send items {char} "【老克塔】装备恢复 {orderNo}" "…" {entry}:{qty}` | args[0]=`{charName}`；args[3]=`{entry}:1`；args 含 orderNo；recovery_item+item_template 造数命中 | handlers-delivery「装备恢复」 |
| `transmog-item_{id}` | TransmogItemHandler | `.transmog add {char} {id}` | args=[charName, 物品id];外观收藏 qty 不参与(WP 同款);2026-10-26 真机 usage 探针核对模块存在 | handlers-delivery「幻化外观」 |
| `item-restoration`（离线） | 同上 precheck | —（支付前拦截） | mock failure 态 → PRECHECK_FAILED message 含「服务器」；余额与订单数零变化（FR-120 零写入） | handlers-delivery「离线拦截」 |
| `itemsend_{id}` | ItemSendHandler | `.send items …`（US3 已覆盖） | delivery.test.ts 全链路（SC-101/102） | tests/integration/delivery.test.ts |

参数矩阵单测（handlers.test.ts，与 CART_PARAM_SCHEMAS 引用同源防漂移）：
路由（前缀/精确/未命中 null）、strict 多余字段拒绝、restoreItemEntry 正整数必选、
unlockName 规范化（含 12 位边界）、公会名 2-24 字符集、destAccount 2-32。

## 二、与契约的偏差（同步过 soap-delivery 表）

1. **规范化时机**：unlockName 首字母大写放在 zod schema `.transform`（加购即落库规范名），
   结账/发货/命令三处同值；契约只约束「命令携带规范名」，此处更早收敛。
2. **precheck 双拦**：同一 `handler.precheck` 在结账事务外先行（失败 → 422 PRECHECK_FAILED
   零写入，quickstart S4）与发货驱动行前各跑一次（失败 → 行 failed 可补发）；
   契约流程 3 只描述发货侧，属增强非冲突。
3. **幂等键**：`orderitem:{id}:{attempt}`（US3 方案，attempt 后缀），契约行文 `=item.id`
   指首次尝试键，语义一致；非堆叠多封(qty>1)为 `orderitem:{id}:{attempt}:m{i}` 子键，
   重试按 requestedBy 计数只补差额(防 CreateItem 超栈钳制导致的重复/少发)。

## 三、真机抽测上线前置清单（mock→真机核对，发现偏差仅改 handlers 层映射并同步本表）

- [x] 全部发货命令真机 usage 探针核对完成（2026-10-25）：四类角色服务形态确认；`.send items` 修正引号形态（裸名+QuotedString 主题/正文+id:count）；**转移/复制/公会类真机无对应原生子命令，商品面对齐 WP 旧站整链移除**
- [x] `.character rename {char} {NewName}` 双参形态真机确认：立即强制改名+踢在线（非下次登录），name-unlock 语义按此注记
- [x] `.transmog add $player $item` 真机确认（2026-10-26）：模块存在(子命令 add/add set/check/reload)，语法与 WP TransmogService 一致；外观收藏成功回执文案待首笔真单核对
- [ ] `.send items` 邮件主题/正文字数与编码（中文+orderNo）真机渲染确认
- [ ] 服务类命令在玩家**在线/离线**两态的生效行为（changerace 等标注 next-login 生效，真机确认离线也安全）
- [ ] 抽测矩阵：每处理器 ≥1 条真机小额订单（SC-106 后半句），走正式审计留痕
