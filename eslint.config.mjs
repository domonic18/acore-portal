import { FlatCompat } from "@eslint/eslintrc";
import boundaries from "eslint-plugin-boundaries";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

/**
 * 依赖方向（AGENTS.md 强制）：app → server → lib → constants
 * components → lib；constants 不引用任何业务层；客户端组件禁止 import server/（server-only 兜底）
 */
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
            { from: ["app"], allow: ["server", "lib", "constants", "components"] },
            { from: ["components"], allow: ["lib", "constants", "components"] },
            { from: ["server"], allow: ["lib", "constants", "server"] },
            { from: ["lib"], allow: ["lib", "constants"] },
            { from: ["constants"], allow: [] },
          ],
        },
      ],
    },
  },
];
