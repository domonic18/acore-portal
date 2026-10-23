// SOAP 通道验证(quickstart S6 / T051):执行 .server info,展示结果/耗时/审计 id
// 用法: pnpm verify:soap(mock 或 worldserver 均可,经 SOAP_URL* 指向)
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { prisma } from "../../src/lib/db";
import { executeSoapCommand } from "../../src/server/soap/execute";

async function main() {
  const key = `verify-soap-${Date.now().toString(36)}`;
  const startedAt = Date.now();

  const result = await executeSoapCommand(".server info", [], {
    idempotencyKey: key,
    idempotent: true,
    requestedBy: "verify:soap",
  });

  console.log("SOAP 通道验证(.server info)");
  if (result.status === "success") {
    console.log(`  状态: success`);
    console.log(`  耗时: ${Date.now() - startedAt}ms(命令耗时 ${result.durationMs}ms)`);
    console.log(`  call_id: ${result.callId}`);
    console.log(`  输出:\n${result.output}`);
  } else {
    console.log(`  状态: failed`);
    console.log(`  尝试: ${result.attempts} 次`);
    console.log(`  call_id: ${result.callId}`);
    console.log(`  错误: ${result.error}`);
  }

  const audits = await prisma.auditLog.findMany({
    where: { category: "soap", payloadJson: { path: "$.key", equals: key } },
    orderBy: { id: "asc" },
    select: { id: true, action: true },
  });
  console.log(`  审计留痕: ${audits.length} 条`);
  for (const a of audits) {
    console.log(`    - id=${a.id} ${a.action}`);
  }

  await prisma.$disconnect();
  if (result.status !== "success") process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
