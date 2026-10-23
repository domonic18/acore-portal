/**
 * 启动自检(FR-022 场景3 / contracts/soap-channel.md 规则5):
 * 五库断言 fail-fast;SOAP 未开仅 degraded 警告,不阻塞启动(worldserver 可能后开)。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // build 阶段的静态化 worker 不做连接探测
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkDatabases } = await import("@/lib/db");
  const checks = await checkDatabases();
  const down = checks.filter((c) => !c.ok);
  if (down.length > 0) {
    for (const c of down) {
      console.error(`[boot] 数据库不可达: ${c.name} — ${c.error}`);
    }
    throw new Error(`[boot] 数据库自检失败: ${down.map((c) => c.name).join(", ")}`);
  }
  console.log(`[boot] 数据库自检通过: ${checks.map((c) => c.name).join(", ")}`);

  const { checkSoap } = await import("@/server/soap/health");
  const soap = await checkSoap();
  if (soap.ok) {
    console.log(`[boot] SOAP 通道正常(${soap.latencyMs}ms)`);
  } else {
    console.warn(`[boot] SOAP 通道 degraded(不阻塞启动): ${soap.error}`);
  }
}
