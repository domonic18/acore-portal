import { PrismaClient } from "../../src/generated/business";

/**
 * E2E 全局播种(webServer 启动前落库):
 * 1. route_map 的 S7 示例条目(p:999 → /account)——服务端 route 缓存是进程内快照
 *    (research R8),启动后的外部直写对长驻进程不可见;
 * 2. system_config 全键自愈播种——instrumentation 启动预热配置 fail-fast,
 *    新库/清库后 e2e 不因缺配置而无法起服务(upsert 不覆盖既有环境定制值)。
 */
const DEV_CONFIG: Record<string, string> = {
  "app.url": "http://localhost:3000",
  "soap.url": "http://localhost:7878/",
  "soap.user": "soaper",
  "soap.password": "change-me",
  "soap.realm": "Dev",
  "smtp.host": "localhost",
  "smtp.port": "1025",
  "smtp.user": "",
  "smtp.password": "",
  "smtp.from": "dev@lokta.local",
  "gamedb.auth": "mysql://acore_auth_writer:auth_writer_pass@localhost:3307/acore_auth",
  "gamedb.characters": "mysql://acore_reader:reader_pass@localhost:3307/acore_characters",
  "gamedb.world": "mysql://acore_reader:reader_pass@localhost:3307/acore_world",
  "gamedb.eluna": "mysql://acore_reader:reader_pass@localhost:3307/eluna",
};

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.routeMap.upsert({
      where: { oldKey: "p:999" },
      create: { oldKey: "p:999", newPath: "/account" },
      update: { newPath: "/account", enabled: true },
    });
    for (const [key, value] of Object.entries(DEV_CONFIG)) {
      await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value },
        update: {},
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
