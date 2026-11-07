# acore-portal 文档中心

> 老克塔（lokta.cn）官网重开发——AzerothCore 怀旧服社区门户。
> 文档体系铁律:**requirement/ 是需求基准,arch/ 是终态方案,plan/ 是迭代状态真相源**。
> 按需阅读,勿全量加载。

## 文档索引

### requirement/(需求基准)

| 文档 | 说明 |
|------|------|
| [01-requirement.md](requirement/01-requirement.md) | 项目定位、三条铁律、分期范围(M1-M4)、明确不做清单、非功能需求 |
| [02-功能规格说明书.md](requirement/02-功能规格说明书.md) | **功能细节权威**：全部功能的现状行为、移植要求、P0-P2 优先级、路由契约（自旧站文档迁入,2026-10-23） |

### arch/(架构设计 · 终态方案)

| 文档 | 说明 | 阅读时机 |
|------|------|----------|
| [00-总体架构设计.md](arch/00-总体架构设计.md) | **已定稿(2026-11-07)**：技术选型结论、系统拓扑、关键数据流、目录依赖方向、部署架构、边界红线 | 首次进入项目必读 |

### research/(调研评估)

| 文档 | 说明 |
|------|------|
| [01-数据迁移与技术方案.md](research/01-数据迁移与技术方案.md) | WP 数据迁移映射、phpass 无感方案、订单清洗/积分对账、决策记录 D1-D6（自旧站文档迁入） |

### ops/(运维手册)

| 文档 | 说明 |
|------|------|
| [production-deploy.md](ops/production-deploy.md) | 生产栈(CVM + compose + Caddy)架构、发布/回滚手册、**§7 门户「人工发布」现状与理由**、子站部署形态差异 |
| [backup-restore.md](ops/backup-restore.md) | 备份口径(cron mysqldump + 对象存储)、恢复流程、与发布窗口的对齐 |

### plan/(迭代计划 · 状态真相源)

| 文档 | 说明 |
|------|------|
| [development-plan.md](plan/development-plan.md) | M1-M4 里程碑与完成状态;**只在此维护状态,不回填过程** |
| [ci-deploy-pipeline-plan.md](plan/ci-deploy-pipeline-plan.md) | CI 发布流水线方案(**待核对 · 未实施**):现状、目标形态、内部项目演练计划、待决问题清单 |

### 里程碑特性规格(specs/)——**仅本地,不入库**

各里程碑的 spec / plan / tasks / contracts / migration-report / launch-checklist / perf-profile 等 SDD 过程产物
位于仓库根 `specs/`,已加入 `.gitignore`,**不在 Git 管控内**(公开仓不暴露过程产物与内部细节)。
交付形态与验收锚点以 [plan/development-plan.md](plan/development-plan.md) 为准;文中出现的
`specs/xxx` 路径一律指本地工作区文件。

## 外部系统

- **飞书「Lokta 重构项目需求池」**: 91 条功能点条目级状态流转（模块/优先级/里程碑/状态/Review 结论），与 02 规格书配套； https://my.feishu.cn/base/EPfDb63bPaBqQTsD5oBc6ztqnwh
- **生产备份**: 本地备份目录（db 全量 dump + files 4.9G + MANIFEST，只读溯源用；路径不入库）

## 背景速览(新会话先看这里)

- **由来**: 生产 WordPress(PHP) 系统过时，决定 Node.js+React 重写；2026-10-23 完成生产全量备份与功能盘点，需求 91 条已全部 Review 确认
- **关键决策**: D1 登录零变化(phpass 透明升级) · D2 保持站点-游戏同密 · D6 不移植"寄送他人角色"；待决 D3 订单清洗口径 / D4 统计数据去留 / D5 rank 整合时机
- **当前阶段**: M1-M4 开发完成(M2-M4 验收顺延真机联调;切生产前置项见本地 `specs/002` launch-checklist §1-8);测试基线 `make check` 90 文件 / 666 vitest + E2E 关态档 176 场景(开态档另跑);下一步 = 上线前置清单核销 → 正式切换
- **红线**: 生产主机在运行，一切操作只读；旧 WordPress 仓库切换下线前保留勿动
