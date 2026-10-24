/**
 * 启动自检(FR-022 场景3 / contracts/soap-channel.md 规则5):
 * 业务库断言 fail-fast → 装载 system_config 预热缓存(缺失/非法 fail-fast)
 * → 游戏四库断言 fail-fast(连接串来自配置);
 * SOAP 未开仅 degraded 警告,不阻塞启动(worldserver 可能后开)。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // build 阶段的静态化 worker 不做连接探测
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkBusinessDatabase } = await import("@/lib/db");
  const business = await checkBusinessDatabase();
  if (!business.ok) {
    console.error(`[boot] 业务库不可达: ${business.error}`);
    throw new Error("[boot] 业务库自检失败");
  }

  const { getConfig } = await import("@/lib/config");
  await getConfig(); // 预热配置缓存;缺失/非法在此 fail-fast
  console.log("[boot] 系统配置装载完成(system_config)");

  const { checkGameDatabases } = await import("@/lib/db");
  const checks = await checkGameDatabases();
  const down = checks.filter((c) => !c.ok);
  if (down.length > 0) {
    for (const c of down) {
      console.error(`[boot] 游戏库不可达: ${c.name} — ${c.error}`);
    }
    throw new Error(`[boot] 游戏库自检失败: ${down.map((c) => c.name).join(", ")}`);
  }
  console.log(`[boot] 游戏库自检通过: ${checks.map((c) => c.name).join(", ")}`);

  const { checkSoap } = await import("@/server/soap/health");
  const soap = await checkSoap();
  if (soap.ok) {
    console.log(`[boot] SOAP 通道正常(${soap.latencyMs}ms)`);
  } else {
    console.warn(`[boot] SOAP 通道 degraded(不阻塞启动): ${soap.error}`);
  }
}
