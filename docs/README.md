# acore-portal 文档中心

> 老克塔（lokta.cn）官网重开发——AzerothCore 怀旧服社区门户。
> 文档体系铁律:**requirement/ 是需求基准,arch/ 是终态方案,plan/ 是迭代状态真相源**。
> 按需阅读,勿全量加载。

## 文档索引

### requirement/(需求基准)

| 文档 | 说明 |
|------|------|
| [01-requirement.md](requirement/01-requirement.md) | 项目定位、三条铁律、分期范围(M1-M4)、明确不做清单、非功能需求 |
| [02-功能规格说明书.md](requirement/02-功能规格说明书.md) | **功能细节权威**：全部功能的现状行为、移植要求、P0-P2 优先级、路由契约（自 ~/Code/lokta/docs 迁入,2026-10-23） |

### arch/(架构设计 · 终态方案)

| 文档 | 说明 | 阅读时机 |
|------|------|----------|
| [00-总体架构设计.md](arch/00-总体架构设计.md) | 技术选型、系统拓扑、部署架构（**待定稿**——候选方案见 research/01 §7） | 首次进入项目必读 |

### research/(调研评估)

| 文档 | 说明 |
|------|------|
| [01-数据迁移与技术方案.md](research/01-数据迁移与技术方案.md) | WP 数据迁移映射、phpass 无感方案、订单清洗/积分对账、技术选型建议、风险清单、决策记录 D1-D6（自 ~/Code/lokta/docs 迁入） |

### specs/(特性规格 · 交付物与验收锚点)

| 目录 | 说明 |
|------|------|
| [001-m1-account-foundation](../specs/001-m1-account-foundation/) | M1 账户地基:spec/plan/tasks/contracts/migration-report |
| [002-m2-shop-points](../specs/002-m2-shop-points/) | M2 商城积分:同结构 + launch-checklist + perf-profile |
| [003-m3-community](../specs/003-m3-community/) | M3 社区门户:同结构(内容/论坛/渐进/状态/媒体/首页六域) |

### plan/(迭代计划 · 状态真相源)

| 文档 | 说明 |
|------|------|
| [development-plan.md](plan/development-plan.md) | M1-M4 里程碑与完成状态;**只在此维护状态,不回填过程** |

## 外部系统

- **飞书「Lokta 重构项目需求池」**: 91 条功能点条目级状态流转（模块/优先级/里程碑/状态/Review 结论），与 02 规格书配套； https://my.feishu.cn/base/EPfDb63bPaBqQTsD5oBc6ztqnwh
- **生产备份**: `~/Code/lokta/`（db 全量 dump + files 4.9G + MANIFEST，只读溯源用）

## 背景速览(新会话先看这里)

- **由来**: 生产 WordPress(PHP) 系统过时，决定 Node.js+React 重写；2026-10-23 完成生产全量备份与功能盘点，需求 91 条已全部 Review 确认
- **关键决策**: D1 登录零变化(phpass 透明升级) · D2 保持站点-游戏同密 · D6 不移植"寄送他人角色"；待决 D3 订单清洗口径 / D4 统计数据去留 / D5 rank 整合时机
- **当前阶段**: M1-M3 开发完成(M2/M3 验收顺延真机联调;切生产前置项见 specs/002、specs/003 launch-checklist);测试基线 `make check` 224 vitest + 59 E2E;下一步 = M3 上线前置清单核销 → M4(工具页/安全收口)
- **红线**: 生产 101.42.117.123 在运行，一切操作只读；旧仓库 `~/Code/acore-cms` 切换下线前保留勿动
