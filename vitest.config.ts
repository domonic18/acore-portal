import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // server-only 是打包期守卫,Node 测试进程本身就是服务端,别名到空模块
      "server-only": path.resolve(import.meta.dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    hookTimeout: 30000,
    setupFiles: ["tests/setup-env.ts"],
    pool: "forks",
  },
});
