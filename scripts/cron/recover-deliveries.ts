// 发货崩溃恢复对账(cron;soap-delivery 契约 §7/research R1):
// 扫描滞留 delivering 超阈值 + 滞留 paid(结账后驱动丢失,issue #66)的订单重新驱动,
// 幂等键(orderitem:{id})兜底防重复发货,未知结果(unknown)门控不自动重发(issue #67)。
// 经 server-only 服务层复用 driveOrderDelivery,以 --conditions=react-server 直连(tsx)。
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { recoverStalledDeliveries } from "../../src/server/services/shop/delivery";
import { prisma } from "../../src/lib/db";

async function main() {
  const { delivering, paid } = await recoverStalledDeliveries();
  console.log(
    `[recover-deliveries] 重新驱动 delivering=${delivering} 个滞留发货 + paid=${paid} 个滞留待发订单`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
