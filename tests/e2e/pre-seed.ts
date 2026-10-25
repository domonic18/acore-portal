import globalSetup from "./global-setup";

/**
 * playwright 1.64 任务序:webServer(plugin setup)先于 globalSetup 执行——
 * 干净库上 instrumentation 配置预热 fail-fast 会先崩掉 dev server,
 * globalSetup 轮不到跑。test:e2e 脚本链须先完成本播种再起 playwright;
 * 与 global-setup 同一函数,幂等,重复执行无害。
 * (不用顶层 await:tsx 按包类型走 CJS 加载会 ERR_REQUIRE_ASYNC_MODULE)
 */
globalSetup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[pre-seed] 失败:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
