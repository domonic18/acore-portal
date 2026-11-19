// 积分日终对账(cron;FR-106/宪法 III):只报告不修复,差异非空退出码 2 供监控告警。
// 修复路径:管理员确认后经 recalculateLedger 重算(后台/脚本),本脚本不自动写库。
// 自包含账本对账逻辑(不经 server-only 服务层,与 scripts/dev/seed.ts 同套路直连业务库)。
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { PrismaClient } from "../../src/generated/business";
import type { FeishuCard } from "../../src/server/services/shared/feishu-card";
import {
  buildReconcilePointsCard,
  buildReconcilePointsFailureCard,
  type ReconcileDiff,
} from "./reconcile-points-alert";

const prisma = new PrismaClient();

type AlertOutcome = "sent" | "skipped" | "failed";

/**
 * 发飞书卡片。
 * 告警链(含 server-only 服务层)按动态导入载入:未以 `--conditions=react-server`
 * 启动时导入会失败——此时降级为只记日志,不影响对账结论与退出码。
 */
async function syncCard(build: () => FeishuCard): Promise<AlertOutcome> {
  try {
    const [{ getConfig }, { sendOpsAlert, describeAlert }] = await Promise.all([
      import("../../src/lib/config"),
      import("./ops-alert"),
    ]);
    const outcome = await sendOpsAlert(await getConfig(), build());
    console.log(`[reconcile-points] 同步卡片:${describeAlert(outcome)}`);
    return outcome;
  } catch (err) {
    console.error(
      `[reconcile-points] 告警通道不可用,仅记录日志:${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return "skipped";
  }
}

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

  const diffs: ReconcileDiff[] = [];
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
    await syncCard(() =>
      buildReconcilePointsCard({ diffs, accounts: accounts.length }),
    );
    process.exitCode = 2;
    return;
  }
  console.log(`[reconcile-points] ok: ${accounts.length} 个账户账实一致`);
  await syncCard(() => buildReconcilePointsCard({ diffs, accounts: accounts.length }));
}

main()
  .catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    await syncCard(() => buildReconcilePointsFailureCard({ reason: message }));
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
