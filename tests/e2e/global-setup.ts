import { PrismaClient } from "../../src/generated/business";

/**
 * E2E 全局播种:route_map 的 S7 示例条目(p:999 → /account)必须在 webServer 启动前落库——
 * 服务端 route 缓存是进程内快照(research R8),启动后的外部直写对长驻进程不可见。
 */
export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.routeMap.upsert({
      where: { oldKey: "p:999" },
      create: { oldKey: "p:999", newPath: "/account" },
      update: { newPath: "/account", enabled: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}
