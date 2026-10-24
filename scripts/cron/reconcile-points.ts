// 积分日终对账(cron;FR-106/宪法 III):只报告不修复,差异非空退出码 2 供监控告警。
// 修复路径:管理员确认后经 recalculateLedger 重算(后台/脚本),本脚本不自动写库。
// 自包含账本对账逻辑(不经 server-only 服务层,与 scripts/dev/seed.ts 同套路直连业务库)。
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { PrismaClient } from "../../src/generated/business";

const prisma = new PrismaClient();

async function main() {
  const accounts = await prisma.pointAccount.findMany({
    select: { userId: true, balance: true },
  });
  const sums = await prisma.pointTransaction.groupBy({
    by: ["userId"],
    _sum: { amount: true },
  });

  const sumMap = new Map(sums.map((s) => [s.userId, s._sum.amount ?? 0]));
  const accountIds = new Set(accounts.map((a) => a.userId));

  const diffs: { userId: string; stored: number; computed: number }[] = [];
  for (const acc of accounts) {
    const computed = sumMap.get(acc.userId) ?? 0;
    if (acc.balance !== computed) {
      diffs.push({ userId: acc.userId.toString(), stored: acc.balance, computed });
    }
  }
  for (const s of sums) {
    if (!accountIds.has(s.userId)) {
      diffs.push({ userId: s.userId.toString(), stored: 0, computed: s._sum.amount ?? 0 });
    }
  }

  if (diffs.length > 0) {
    console.error(`[reconcile-points] 发现 ${diffs.length} 处差异:`);
    for (const d of diffs) {
      console.error(`  user=${d.userId} stored=${d.stored} computed=${d.computed}`);
    }
    process.exitCode = 2;
    return;
  }
  console.log(`[reconcile-points] ok: ${accounts.length} 个账户账实一致`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
