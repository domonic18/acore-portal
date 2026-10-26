import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";

/**
 * 系统配置唯一入口:SMTP/SOAP/游戏库连接串/站点地址等业务通道配置存 system_config 表,
 * env 仅存业务库/Redis 连接串与会话签名密钥(宪法 v1.0.2)。
 * 启动时经 instrumentation 预热 fail-fast;运行期读进程内缓存,
 * 管理端变更配置后调 reloadSystemConfig 写穿失效。凭据值禁止打印/落日志。
 */
const configSchema = z.object({
  app: z.object({
    url: z.string().url(),
  }),
  soap: z.object({
    url: z.string().url(),
    user: z.string().min(1),
    password: z.string().min(1),
    realm: z.string().default("Dev"),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive(),
    user: z.string().default(""),
    password: z.string().default(""),
    from: z.string().email(),
  }),
  // 游戏四库连接串(auth 库账号须具备 account 表写权限,根本防线 research R5);
  // 进程内惰性建连,改库连接需重启生效
  gamedb: z.object({
    auth: z.string().url(),
    characters: z.string().url(),
    world: z.string().url(),
    eluna: z.string().url(),
  }),
  // COS 对象存储(M2 US6 图片迁移;未配置=功能未启用,不阻塞启动,US6 首用时报错)
  cos: z
    .object({
      bucket: z.string().min(1),
      region: z.string().min(1),
      secretId: z.string().min(1),
      secretKey: z.string().min(1),
      cdnBase: z.string().url(),
    })
    .optional(),
  // 服务器状态人工项(M3 US6;p15 字段二分):键缺省按 enabled=true/maintenance=false
  status: z.object({
    enabled: z.boolean(),
    maintenanceMode: z.boolean(),
  }),
  // Turnstile 人机校验(M4 US2):未配置=关闭直通;enabled=true 必须带双密钥
  // (键允许空串,非空约束由 superRefine 在 enabled=true 时才生效)
  turnstile: z
    .object({
      enabled: z.boolean(),
      siteKey: z.string(),
      secretKey: z.string(),
    })
    .superRefine((val, ctx) => {
      if (val.enabled && (!val.siteKey || !val.secretKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "enabled=true 时 siteKey/secretKey 必填",
          path: ["siteKey"],
        });
      }
    })
    .optional(),
  // 登录防滥用参数(M4 US2):连续失败阈值/计数窗口/锁定时长
  security: z.object({
    loginMaxFails: z.coerce.number().int().positive().default(5),
    loginWindowSec: z.coerce.number().int().positive().default(900),
    loginLockSec: z.coerce.number().int().positive().default(900),
  }),
  // 通知域(M4 US3):积分变动邮件阈值(0=关闭)
  notify: z.object({
    pointEmailThreshold: z.coerce.number().int().min(0).default(0),
  }),
  // 站点标识与联系方式(CRUD 对齐审计):icp 空=页脚不渲染备案链接,qqGroup 空=不渲染
  site: z.object({
    icp: z.string().default("京ICP备2022035466号"),
    qqGroup: z.string().default("184670219"),
  }),
  // 侧栏下载入口(CRUD 对齐审计):url 空=对应卡片隐藏;默认指向教程页下载区
  download: z.object({
    clientUrl: z.string().default("/tutorial"),
    clientNote: z.string().default("1.12 完整客户端"),
    launcherUrl: z.string().default("/tutorial"),
    launcherNote: z.string().default("一键登录"),
    addonUrl: z.string().default("/tutorial"),
    addonNote: z.string().default("整合包"),
    yyNote: z.string().default("频道号见公告"),
  }),
  // 首页配置(US 首页配置):最近成就 iframe 嵌入三参数;url 空=整块隐藏,
  // 高度为 CSS 长度(185vh/600px 等),scrolling 控制 iframe 滚动条;
  // 轮播间隔秒数(1-60,默认 5)供 HomeCarousel 自动轮播
  home: z.object({
    achievementUrl: z.string().default(""),
    achievementHeight: z.string().default("185vh"),
    achievementScrolling: z.boolean().default(false),
    carouselIntervalSec: z.coerce.number().int().min(1).max(60).default(5),
  }),
  // Umami 统计(M4 US4):未配置=不注入采集脚本+看板区块「暂不可用」
  umami: z
    .object({
      scriptUrl: z.string().url(),
      websiteId: z.string().min(1),
      apiUrl: z.string().url(),
      apiUsername: z.string().min(1),
      apiPassword: z.string().min(1),
    })
    .optional(),
  // 备份(M4 US5):脚本运行参数,不影响 web 启动
  backup: z
    .object({
      retentionDays: z.coerce.number().int().min(0).default(30),
      gameWeekly: z.boolean().default(true),
    })
    .optional(),
});

export type SystemConfig = z.infer<typeof configSchema>;

let cache: SystemConfig | null = null;

function flattenToSchema(rows: { key: string; value: string }[]) {
  const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    app: { url: flat["app.url"] },
    soap: {
      url: flat["soap.url"],
      user: flat["soap.user"],
      password: flat["soap.password"],
      realm: flat["soap.realm"],
    },
    smtp: {
      host: flat["smtp.host"],
      port: flat["smtp.port"],
      user: flat["smtp.user"] ?? "",
      password: flat["smtp.password"] ?? "",
      from: flat["smtp.from"],
    },
    gamedb: {
      auth: flat["gamedb.auth"],
      characters: flat["gamedb.characters"],
      world: flat["gamedb.world"],
      eluna: flat["gamedb.eluna"],
    },
    cos: flat["cos.bucket"]
      ? {
          bucket: flat["cos.bucket"],
          region: flat["cos.region"],
          secretId: flat["cos.secretId"],
          secretKey: flat["cos.secretKey"],
          cdnBase: flat["cos.cdnBase"],
        }
      : undefined,
    status: {
      enabled: flat["status.enabled"] !== "false",
      maintenanceMode: flat["status.maintenance_mode"] === "true",
    },
    turnstile: flat["turnstile.enabled"]
      ? {
          enabled: flat["turnstile.enabled"] === "true",
          siteKey: flat["turnstile.siteKey"] ?? "",
          secretKey: flat["turnstile.secretKey"] ?? "",
        }
      : undefined,
    security: {
      loginMaxFails: flat["security.loginMaxFails"] ?? "5",
      loginWindowSec: flat["security.loginWindowSec"] ?? "900",
      loginLockSec: flat["security.loginLockSec"] ?? "900",
    },
    notify: {
      pointEmailThreshold: flat["notify.pointEmailThreshold"] ?? "0",
    },
    site: {
      icp: flat["site.icp"] ?? "京ICP备2022035466号",
      qqGroup: flat["site.qqGroup"] ?? "184670219",
    },
    download: {
      clientUrl: flat["download.client.url"] ?? "/tutorial",
      clientNote: flat["download.client.note"] ?? "1.12 完整客户端",
      launcherUrl: flat["download.launcher.url"] ?? "/tutorial",
      launcherNote: flat["download.launcher.note"] ?? "一键登录",
      addonUrl: flat["download.addon.url"] ?? "/tutorial",
      addonNote: flat["download.addon.note"] ?? "整合包",
      yyNote: flat["download.yy.note"] ?? "频道号见公告",
    },
    home: {
      achievementUrl: flat["home.achievementUrl"] ?? "",
      achievementHeight: flat["home.achievementHeight"] ?? "185vh",
      achievementScrolling: flat["home.achievementScrolling"] === "true",
      carouselIntervalSec: flat["home.carouselIntervalSec"] ?? "5",
    },
    umami: flat["umami.scriptUrl"]
      ? {
          scriptUrl: flat["umami.scriptUrl"],
          websiteId: flat["umami.websiteId"] ?? "",
          apiUrl: flat["umami.apiUrl"] ?? "",
          apiUsername: flat["umami.apiUsername"] ?? "",
          apiPassword: flat["umami.apiPassword"] ?? "",
        }
      : undefined,
    backup: flat["backup.retentionDays"] ?? flat["backup.gameWeekly"]
      ? {
          retentionDays: flat["backup.retentionDays"] ?? "30",
          gameWeekly: flat["backup.gameWeekly"] !== "false",
        }
      : undefined,
  };
}

function parseConfig(raw: ReturnType<typeof flattenToSchema>): SystemConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // 只报缺失/格式,不回显任何值
    throw new Error(`system_config 配置校验失败(检查 system_config 表): ${issues}`);
  }
  return parsed.data;
}

export async function loadSystemConfig(): Promise<SystemConfig> {
  const rows = await prisma.systemConfig.findMany({
    select: { key: true, value: true },
  });
  return buildConfigFromRows(rows);
}

/** 纯函数(KV 行→校验后配置),供单测与设置保存路径复用 */
export function buildConfigFromRows(
  rows: { key: string; value: string }[],
): SystemConfig {
  return parseConfig(flattenToSchema(rows));
}

/** 读配置(首次调用查库并缓存;之后读缓存) */
export async function getConfig(): Promise<SystemConfig> {
  if (!cache) {
    cache = await loadSystemConfig();
  }
  return cache;
}

export async function reloadSystemConfig(): Promise<SystemConfig> {
  cache = await loadSystemConfig();
  return cache;
}

/** 图片域白名单(renderMarkdown cdnHosts):cos.cdnBase 主机名;未配置=仅站内相对路径放行 */
export async function getCdnHosts(): Promise<string[]> {
  const cos = (await getConfig()).cos;
  return cos ? [new URL(cos.cdnBase).hostname] : [];
}
