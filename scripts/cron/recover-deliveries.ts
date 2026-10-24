// 发货崩溃恢复对账(cron;soap-delivery 契约 §7/research R1):
// 扫描滞留 delivering 超阈值的订单重新驱动,幂等键(orderitem:{id}:{attempt})兜底防重复发货。
// 经 server-only 服务层复用 driveOrderDelivery,以 --conditions=react-server 直连(tsx)。
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { recoverStalledDeliveries } from "../../src/server/services/shop/delivery";
import { prisma } from "../../src/lib/db";

async function main() {
  const recovered = await recoverStalledDeliveries();
  console.log(`[recover-deliveries] 重新驱动 ${recovered} 个滞留 delivering 订单`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
