import { FlatCompat } from "@eslint/eslintrc";
import boundaries from "eslint-plugin-boundaries";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

/**
 * 依赖方向（AGENTS.md 强制）：app → server → lib → constants
 * components → lib；constants 不引用任何业务层；客户端组件禁止 import server/（server-only 兜底）
 * services 域间禁横向 import：横切设施走 services/shared/，
 * 业务域编排调用须在此登记（ORCHESTRATION_EDGES），未登记的域间 import 直接报错。
 */
const ORCHESTRATION_EDGES = {
  // 购物车/下单校验商品与限购（catalog 是商品数据权威）
  shop: ["catalog"],
  // SKU 合法性校验复用商品处理器注册表（sku → handler 契约）
  catalog: ["shop"],
  // 后台改角色/注册奖励读取积分规则（规则常量在 points/rules）
  "users-admin": ["points"],
  auth: ["points"],
  // 状态页聚合读进度数据；看板聚合状态与商品
  status: ["progression"],
  stats: ["status", "catalog"],
  // 渐进计划后台挂文章
  progression: ["content"],
  // 订单后台复用交付与状态机
  orders: ["shop"],
  // 首页聚合文章/进度/商品
  home: ["progression", "content", "catalog"],
  // 侧栏聚合在线人数与最新资讯（内置组件按页面范围启用时条件取数）
  sidebar: ["status", "content"],
};
export default [
  { ignores: ["node_modules/**", ".next/**", "src/generated/**", "next-env.d.ts"] },
  // next 规则只对 src 生效:其旧版插件在 ESLint 9 下对 scripts/tests 等非 JSX 文件会崩溃
  ...compat
    .extends("next/core-web-vitals")
    .map((c) => ({ files: ["src/**/*.{ts,tsx}"], ...c })),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "server-shared", pattern: "src/server/services/shared/**" },
        {
          type: "server-domain",
          pattern: "src/server/services/(*)",
          capture: ["domain"],
        },
        { type: "server", pattern: "src/server/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "constants", pattern: "src/constants/**" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: ["app"], allow: ["server", "server-shared", "server-domain", "lib", "constants", "components"] },
            { from: ["components"], allow: ["lib", "constants", "components"] },
            { from: ["server-shared"], allow: ["lib", "constants", "server-shared"] },
            // 域服务只可横向调用 shared 与已登记的编排边
            ...Object.entries(ORCHESTRATION_EDGES).map(([domain, targets]) => ({
              from: [["server-domain", { domain }]],
              allow: [
                "lib",
                "constants",
                "server",
                "server-shared",
                ["server-domain", { domain }],
                ...targets.map((target) => ["server-domain", { domain: target }]),
              ],
            })),
            {
              from: ["server-domain"],
              allow: [
                "lib",
                "constants",
                "server",
                "server-shared",
                ["server-domain", { domain: "${from.domain}" }],
              ],
            },
            { from: ["server"], allow: ["lib", "constants", "server", "server-shared"] },
            { from: ["lib"], allow: ["lib", "constants"] },
            { from: ["constants"], allow: [] },
          ],
        },
      ],
    },
  },
];
