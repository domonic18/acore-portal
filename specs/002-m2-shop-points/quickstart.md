# Quickstart: M2 营收 — 验证场景

**Feature**: specs/002-m2-shop-points | **前置**: M1 全绿基线（63 vitest + 17 E2E）；dev compose（mysql 3307 + redis + soap-mock）；测试商品/账户 seed 随 tasks 落地

> 每场景对应 SC 锚点；`make check`（lint+typecheck+test）必须全绿为一切前提。命令契约以 [soap-delivery.md](./contracts/soap-delivery.md) 为准。

## S1 积分域（SC-105 前置、FR-101~107）

1. 测试账户入账：注册奖励自动 +2 → 断言流水 balanceAfter=2 且余额=2
2. 管理员手调 +50（带原因）→ 断言 manual_adjust 流水含操作者引用；手调 −10000 → 402 拦截
3. 余额篡改注入：直接 SQL 改 point_account.balance → 跑对账任务 → 断言差异清单点名该户；恢复后清单空
4. 日终对账任务连跑两次 → 两次产出空差异
5. vitest：流水类型 6 类枚举映射断言；规则表驱动（改 point_rule.amount 后新注册奖励=新值）

## S2 商城浏览与购物车（FR-108~115、112~113）

1. seed 商品（2 分类 5 商品：3 物品类含促销档期、2 服务类）→ `/shop` 分类筛选/价格排序/分页断言
2. 详情页：促销档期内 effectivePrice=促销价+划线展示；过期恢复原价（vitest 时间注入）
3. 未登录点加购 → 跳登录；登录后选本人角色加购 → 购物车行显示角色名
4. 越权：API 直发他人 characterGuid → 403 + 审计 ownership_violation
5. 装备恢复商品未选物品 → 加购 422；售罄商品（stock=0）加购 → 409 且前台标记售罄仍可见

## S3 结账全链路（SC-101/102/103/104 核心锚点）

1. 余额充足账户购买库存 1 的限量商品 → 断言：shop_payment 流水、余额扣减、stock=0 自动售罄、mock 收到 send items 命令（幂等键=item.id）、订单**自动 completed**——全程无人工
2. 失败注入：mock 对该命令返回失败 → 订单 delivery_failed + deliveryError 可见；后台补发 → mock 成功 → 订单 completed；补发按钮再点一次（幂等命中）→ 命令总次数不变（SC-102）
3. 余额不足（余额 10 买 60）→ 402、无订单无流水
4. 并发：脚本双线程同购库存 1 商品 → 恰 1 单成功；同账户并发双结账 → 串行化无透支
5. E2E（Playwright）：登录→选角色→加购→结账→订单详情 completed；用户中心订单列表/详情可见（FR-121）

## S4 服务处理器矩阵（SC-106、FR-122~124）

每处理器 1 条 mock 实测订单（参数矩阵见 soap-delivery 表）：

- 角色转移：destAccount 不存在 → 结账 422；存在 → mock 收到 transfer 命令
- 名字解锁：全小写输入 → 落库 unlockName 首字母大写；占用名 → 422
- 公会变更：非法公会名 → 422
- 装备恢复：服务器离线注入（mock health=down）→ 支付前拦截（precheck）
- 幻化单件（itemsend_* 前缀路由）→ ItemSendHandler 命中
- 全部断言：params 随订单行落库、deliveryStatus 回写、状态闭环

## S5 运营后台（SC-107、FR-125~130）

1. 非管理员访问 /admin/* → 403 + admin_access_violation 审计；moderator 同样 403
2. 商品保存：gameItemId=999999（world 不存在）→ 422 拒绝；service sku 未注册 → 422；合法保存 → 列表可见
3. 低库存：stock 降至阈值 → 后台导航计数标记；上下架 → 列表消失、直链可访问、历史订单快照不受影响
4. 退款：completed 订单退款 → 积分回补流水（shop_payment 负值）+ 库存回补 + 状态 refunded + 审计
5. 邀请码：批量生成 10 个 → 列表/使用记录可查；停用 → 状态 disabled

## S6 存量迁移与对账（SC-105/108、FR-131~133）

1. `shop-import.sql` 于 seed 临时库首跑 → 商品 99/分类 14/订单按 D3 分布断言；复核清单=金额不符单数
2. **幂等重跑** → 零新增行（legacyWp* 键断言）
3. 积分迁移（D7）：每户 balance=存量 mycred_default；差额户补 manual_adjust(D7) 流水；全量重算差异=0；抽样 20 户前端一致
4. SKU 校验失败物品 → draft + 清单（不阻塞）
5. `cos-upload.mjs`：幂等上传（重复跑零上传）→ image_asset_map 覆盖率报告；抽样 5 个存量页面图片经新 URL 全部可达；死链扫描=0

## 验收门

- S1-S5 全绿 + S6 首两项（开发期）;S6 全项在测试环境数据到位后执行
- 真机联调（worldserver 对接、命令名核对、每处理器真机抽测）= **上线前置清单**，不在本里程碑验收门内（2026-10-24 决策）
