# acore-portal

> 老克塔（lokta.cn）官网重开发——魔兽世界 60 年代怀旧服（AzerothCore 引擎）社区门户：门户资讯 + 玩家自助服务 + 积分商城（游戏内自动发货）+ 论坛社区。替代生产 WordPress 系统（旧仓库 `~/Code/acore-cms`，切换下线前保留）。

## 技术栈

- Next.js 全栈单体（React 18 + App Router + Tailwind）——推荐方案，待选型定稿
- Prisma（新业务库 + 游戏三库只读 + auth 库可写）· Redis · node-soap · 腾讯云 COS

## 快速开始

```bash
# 1. 克隆后复制环境变量
cp .env.example .env

# 2. 启动本地依赖（MySQL + Redis）
docker compose -f docker/docker-compose.dev.yml up -d

# 3. 安装依赖并启动（待选型定稿后补充具体命令）
```

## 文档

完整文档见 [docs/README.md](docs/README.md)：

- **需求基准**：[docs/requirement/](docs/requirement/)
- **架构设计**：[docs/arch/](docs/arch/)
- **迭代计划**：[docs/plan/development-plan.md](docs/plan/development-plan.md)
- **调研评估**：[docs/research/](docs/research/)

需求条目状态流转在飞书多维表格「Lokta 重构项目需求池」（91 条已确认，状态真相源之一：条目状态看这里）。

## 目录结构

```
docs/        文档中心（需求基准 / 架构终态 / 迭代计划 / 调研评估）
scripts/     运维与工具脚本（数据迁移脚本后续放这里）
src/         源码（技术选型定稿后按框架惯例组织）
tests/       测试
workspace/   宿主机持久化数据（MySQL/Redis 数据、上传文件，gitignore 不入库）
```
