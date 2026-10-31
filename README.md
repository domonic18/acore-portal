# acore-portal

> 老克塔（lokta.cn）官网重开发——魔兽世界 60 年代怀旧服（AzerothCore 引擎）社区门户：门户资讯 + 玩家自助服务 + 积分商城（游戏内自动发货）+ 论坛社区。替代生产 WordPress 系统（旧仓库 `~/Code/acore-cms`，切换下线前保留）。

## 技术栈

- Next.js 全栈单体（React 18 + App Router + Tailwind）
- Prisma 多 schema（新业务库可写迁移 + 游戏三库只读 + auth 库契约写）· Redis · SOAP 游戏命令层（幂等键回放/重试/审计）· 腾讯云 COS+CDN
- 已实现：账号全链路（双格式密码无感迁移）· 积分账本（流水为真相源+日终对账）· 积分商城全链路（购物车/结账/SOAP 自动发货/订单状态机）· 运营后台（商品/订单/用户/积分手调/迁移复核）· WP 存量数据迁移管线（用户/订单/积分/图片映射）

## 快速开始

```bash
# 1. 克隆后复制环境变量
cp .env.example .env

# 2. 启动本地依赖（MySQL 3307 + Redis + Mailpit + SOAP mock）
make up

# 3. 安装依赖、生成 5 个 Prisma client、业务库迁移、开发种子
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 4. 启动开发服务器
pnpm dev                # http://localhost:3000

# 质量门禁与测试
make check              # lint + typecheck + vitest(292)
pnpm test:e2e           # Playwright E2E 关态档(79, 未起 dev server 时自带 webServer)
pnpm test:e2e:turnstile # E2E 开态档(Turnstile 测试密钥, 与关态同量)
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
prisma/       多 schema 真相源（schema-business 可迁移；schema-auth/characters/world/eluna 映射游戏库）
src/
├── app/      App Router：页面/Route Handlers 薄层（业务下沉 server/）
├── server/   services/（业务编排,含 shop/handlers 服务类商品处理器）+ soap/（游戏命令层）
├── components/  React 组件（展示层,禁直连数据库）
├── lib/      基础设施（db×5/redis/auth/config/cos）
└── constants/ 全局枚举（订单状态/积分类型/SKU 前缀/SOAP 命令）
scripts/
├── dev/      seed/initdb fixture/SOAP mock
├── verify/   验收自检（soap-check/sc001-login）
├── migrate/  WP→新库迁移管线（users/shop/points/cos,全幂等可重跑）
└── cron/     日终任务（对账/发货恢复）
docker/       部署资产（dev/test compose+web/Dockerfile）
tests/        vitest(单元/集成) + Playwright(E2E)
workspace/    宿主机持久化数据（gitignore 不入库）
docs/         文档中心
```
