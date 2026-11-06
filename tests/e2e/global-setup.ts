import { PrismaClient } from "../../src/generated/business";
import { TOOL_PAGES } from "../../src/constants/tools";
import { warmUp } from "./warmup";

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

/**
 * 腾讯云验证码开态档(2026-11-07 替换 Turnstile):
 * 腾讯云**没有官方测试密钥**,故这里只播种「已启用且四件套齐备」的形态,
 * 让服务端走到票据校验分支(缺票据 → 422 CAPTCHA_FAILED);
 * 「真票据通过」路径需真实 CaptchaAppId + AppSecretKey + 云API SecretId/SecretKey 联调,CI 不覆盖。
 */
const CAPTCHA_E2E: Record<string, string> = {
  "captcha.enabled": "true",
  "captcha.appId": "1234567",
  "captcha.appSecret": "e2e-app-secret",
  "captcha.secretId": "AKID-e2e",
  "captcha.secretKey": "e2e-secret-key",
};

/**
 * 登录防滥用阈值的 E2E 预置(2026-11-06 撞库加固 PR-C):
 * 全套 169 场景每场都可能登录,哈希次数远超生产默认预算(60 次/分),
 * 不放宽则 E2E 会被 429 SERVER_BUSY 误伤(生产值由后台设置页固化,此处只管测试库)。
 * trustedProxyHops=0:E2E 直连本地 dev server,应用正前方**没有**可信代理
 * (next dev 自己塞的 X-Forwarded-For 是 socket 地址,不是代理转发的客户端地址),
 * 按「无可信代理」口径一律落「未知 IP」桶(兜底桶上限同步放宽)。
 * 另:所有 E2E 请求共享同一个来源地址,若解析成真实 IP 则共用一个限流桶,
 * 页面访问上报(30 次/分)等按 IP 限速必然越阈 → 未知桶是唯一无共享桶的落点。
 */
const SECURITY_E2E: Record<string, string> = {
  "security.trustedProxyHops": "0",
  "security.loginGlobalMaxPerMin": "6000",
  "security.loginIpSoftFails": "1000",
  "security.loginIpMaxFails": "5000",
  "security.loginUnknownIpMaxPerMin": "100000",
  // 未鉴权端点的按 IP 限速(PR-G):E2E 全部请求落「未知 IP」共享桶,须放宽
  "security.registerIpMaxPerHour": "1000",
  "security.pwresetIpMaxPerHour": "1000",
  "security.emailChangeIpMaxPerHour": "1000",
  "security.unknownIpMaxPerHour": "100000",
  // 状态页限速(PR-H):E2E 每个页面都轮询 /api/status,全局桶须放宽
  "security.statusIpMaxPerMin": "10000",
  "security.statusGlobalMaxPerMin": "100000",
  "security.statusUnknownIpMaxPerMin": "100000",
  // 阅读计数限速(PR-I):同篇重复上报须照常计入,否则前台 views 断言漂移
  "security.artviewIpMaxPerMin": "10000",
  "security.artviewArticleMax": "100",
  "security.artviewArticleWindowSec": "600",
};

/** 播种路由映射与系统配置(幂等;pre-seed 与 globalSetup 共用) */
export async function seed() {
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
    if (process.env.E2E_CAPTCHA === "1") {
      for (const [key, value] of Object.entries(CAPTCHA_E2E)) {
        await prisma.systemConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
    } else {
      // 关态档自愈:清残留行,保证无控件直通基线(config 进程内快照,须启动前落库)
      await prisma.systemConfig.deleteMany({
        where: { key: { in: Object.keys(CAPTCHA_E2E) } },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Playwright globalSetup:播种 + 路由预热。
 * 任务序:webServer(plugin setup)先于 globalSetup —— dev server 已就绪,
 * 预热可在此时打路由让 next dev 提前编译(见 tests/e2e/warmup.ts)。
 */
export default async function globalSetup() {
  await seed();
  await warmUp();
}
