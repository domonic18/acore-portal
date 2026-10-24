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
    // 集成文件共享同一 MySQL+soap-mock(全局 /__mode、共享 fixture 行),
    // 并行会互踩(fixture 撞锁死锁/mock 模式互泼/跨文件 FK),文件级串行保确定性
    fileParallelism: false,
  },
});
