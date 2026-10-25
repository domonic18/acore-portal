import { PrismaClient } from "../../src/generated/business";
import { TOOL_PAGES } from "../../src/constants/tools";

/**
 * E2E 全局播种(webServer 启动前落库):
 * 1. route_map 的 S7 示例条目(p:999 → /account)——服务端 route 缓存是进程内快照
 *    (research R8),启动后的外部直写对长驻进程不可见;
 * 2. route_map 工具页六键(M4 US1 T024,page_id:537 等 → /banlist 等);
 * 3. system_config 全键自愈播种——instrumentation 启动预热配置 fail-fast,
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

/** Turnstile 开态档(M4 T013):官方测试密钥,widget 自动通过、siteverify 恒真 */
const TURNSTILE_E2E: Record<string, string> = {
  "turnstile.enabled": "true",
  "turnstile.siteKey": "1x00000000000000000000AA",
  "turnstile.secretKey": "1x0000000000000000000000000000000AA",
};

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    await prisma.routeMap.upsert({
      where: { oldKey: "p:999" },
      create: { oldKey: "p:999", newPath: "/account" },
      update: { newPath: "/account", enabled: true },
    });
    for (const tool of TOOL_PAGES) {
      const oldKey = `page_id:${tool.legacyPageId}`;
      await prisma.routeMap.upsert({
        where: { oldKey },
        create: { oldKey, newPath: tool.path },
        update: { newPath: tool.path, enabled: true },
      });
    }
    for (const [key, value] of Object.entries(DEV_CONFIG)) {
      await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value },
        update: {},
      });
    }
    if (process.env.E2E_TURNSTILE === "1") {
      for (const [key, value] of Object.entries(TURNSTILE_E2E)) {
        await prisma.systemConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
    } else {
      // 关态档自愈:清残留行,保证无 widget 直通基线(config 进程内快照,须启动前落库)
      await prisma.systemConfig.deleteMany({
        where: { key: { in: Object.keys(TURNSTILE_E2E) } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
