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
  // dev compose 的 soap-mock 宿主端口 17878(7878 让位真机 worldserver)
  "soap.url": "http://localhost:17878/",
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

/**
 * 登录防滥用阈值的 E2E 预置(2026-11-06 撞库加固 PR-C):
 * 全套 151 场景每场都可能登录,哈希次数远超生产默认预算(60 次/分),
 * 不放宽则 E2E 会被 429 SERVER_BUSY 误伤(生产值由后台设置页固化,此处只管测试库)。
 * trustedProxyHops=1:应用正前方 1 个可信代理(Caddy/frp);本地 pnpm dev 不发 XFF,
 * 请求落「未知 IP」桶(兜底桶上限同步放宽)。
 */
const SECURITY_E2E: Record<string, string> = {
  "security.trustedProxyHops": "1",
  "security.loginGlobalMaxPerMin": "6000",
  "security.loginIpSoftFails": "1000",
  "security.loginIpMaxFails": "5000",
  "security.loginUnknownIpMaxPerMin": "100000",
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
    // 防滥用阈值按 E2E 规模强制覆盖(不沿用库里旧值,否则多次跑完被历史阈值误伤)
    for (const [key, value] of Object.entries(SECURITY_E2E)) {
      await prisma.systemConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
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
