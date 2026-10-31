import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));

// SMTP 通道 mock(T029 任务口径:测试发信成功/失败两态 mock transporter;
// 其余依赖 dev 库/redis 直连不 mock)
vi.mock("@/lib/mail", () => ({
  getTransporter: async () => ({ sendMail: sendMailMock }),
}));

import { prisma } from "@/lib/db/business";
import { reloadSystemConfig, getConfig } from "@/lib/config";
import { AUDIT_ACTION } from "@/constants/audit";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup as saveGroup, sendTestMail } from "@/server/services/settings/save";

/**
 * T029:设置服务集成——GET 掩码态(无明文)/PUT 组校验 422/敏感字段空=保持非空=覆写/
 * 保存后 reloadSystemConfig 热生效/审计 SETTINGS_CHANGED 无值落盘/test-mail 成功失败两态。
 * system_config 五组键为全局共享键:用前快照、用后还原(admin-stats umami 先例)。
 */

const ADMIN_ID = 3n;

const SMTP_KEYS = ["smtp.host", "smtp.port", "smtp.user", "smtp.password", "smtp.from"];
const TURNSTILE_KEYS = ["turnstile.enabled", "turnstile.siteKey", "turnstile.secretKey"];
const SECURITY_KEYS = ["security.loginMaxFails", "security.loginWindowSec", "security.loginLockSec"];
const NOTIFY_KEYS = ["notify.pointEmailThreshold"];
const SITE_KEYS = ["site.icp", "site.qqGroup"];
const DOWNLOAD_KEYS = [
  "download.client.url",
  "download.client.note",
  "download.launcher.url",
  "download.launcher.note",
  "download.addon.url",
  "download.addon.note",
  "download.yy.note",
];
const UMAMI_KEYS = [
  "umami.scriptUrl",
  "umami.websiteId",
  "umami.apiUrl",
  "umami.apiUsername",
  "umami.apiPassword",
];
const HOME_KEYS = [
  "home.achievementUrl",
  "home.achievementHeight",
  "home.achievementScrolling",
  "home.carouselIntervalSec",
];
const ALL_KEYS = [
  ...SMTP_KEYS,
  ...TURNSTILE_KEYS,
  ...SECURITY_KEYS,
  ...NOTIFY_KEYS,
  ...SITE_KEYS,
  ...DOWNLOAD_KEYS,
  ...UMAMI_KEYS,
  ...HOME_KEYS,
];

let backup: { key: string; value: string }[] = [];

async function setKeys(entries: Record<string, string>) {
  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.systemConfig.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
  await reloadSystemConfig();
}

async function delKeys(keys: string[]) {
  await prisma.systemConfig.deleteMany({ where: { key: { in: keys } } });
  await reloadSystemConfig();
}

async function latestAudit(action: string) {
  return prisma.auditLog.findFirst({
    where: { action, actorUserId: ADMIN_ID },
    orderBy: { id: "desc" },
  });
}

beforeAll(async () => {
  backup = await prisma.systemConfig.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, value: true },
  });
  sendMailMock.mockReset();
});

afterAll(async () => {
  // 还原快照:原缺失的键删除,原存在的键写回
  await prisma.systemConfig.deleteMany({ where: { key: { in: ALL_KEYS } } });
  if (backup.length > 0) {
    await prisma.systemConfig.createMany({ data: backup });
  }
  await reloadSystemConfig();
  await prisma.auditLog.deleteMany({
    where: {
      action: { in: [AUDIT_ACTION.SETTINGS_CHANGED, AUDIT_ACTION.SETTINGS_TEST_MAIL] },
      actorUserId: ADMIN_ID,
    },
  });
  await prisma.$disconnect();
});

describe("getSettingsView(T029)", () => {
  it("掩码态:passwordConfigured 布尔,JSON 序列化不含任何明文密钥", async () => {
    await setKeys({
      "smtp.host": "smtp.test.local",
      "smtp.port": "465",
      "smtp.user": "u1",
      "smtp.password": "plain-secret-pw",
      "smtp.from": "noreply@lokta.local",
      "umami.scriptUrl": "https://stats.test.local/script.js",
      "umami.websiteId": "wid-mask",
      "umami.apiUrl": "https://stats.test.local/api",
      "umami.apiUsername": "viewer",
      "umami.apiPassword": "umami-plain-pw",
      "turnstile.enabled": "true",
      "turnstile.siteKey": "site-x",
      "turnstile.secretKey": "turn-plain-secret",
    });
    const view = await getSettingsView();
    expect(view.smtp.passwordConfigured).toBe(true);
    expect(view.turnstile).toMatchObject({ enabled: true, siteKey: "site-x", secretKeyConfigured: true });
    expect(view.umami).toMatchObject({ configured: true, apiPasswordConfigured: true });
    const dumped = JSON.stringify(view);
    expect(dumped).not.toContain("plain-secret-pw");
    expect(dumped).not.toContain("turn-plain-secret");
    expect(dumped).not.toContain("umami-plain-pw");
  });

  it("未配置:turnstile 走关闭态,umami configured:false 字段全 null", async () => {
    await delKeys([...TURNSTILE_KEYS, ...UMAMI_KEYS]);
    const view = await getSettingsView();
    expect(view.turnstile).toEqual({ enabled: false, siteKey: null, secretKeyConfigured: false });
    expect(view.umami).toEqual({
      configured: false,
      scriptUrl: null,
      websiteId: null,
      apiUrl: null,
      apiUsername: null,
      apiPasswordConfigured: false,
    });
  });
});

describe("saveSettingsGroup(T029)", () => {
  it("smtp 全量保存:覆写+审计 SETTINGS_CHANGED 只落键名不落值", async () => {
    const result = await saveGroup(
      "smtp",
      { host: "smtp2.test.local", port: 587, user: "u2", password: "brand-new-pw", from: "ops@lokta.local" },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: SMTP_KEYS } },
      select: { key: true, value: true },
    });
    const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(flat["smtp.host"]).toBe("smtp2.test.local");
    expect(flat["smtp.password"]).toBe("brand-new-pw");
    expect((await getConfig()).smtp.host).toBe("smtp2.test.local");

    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect(audit).not.toBeNull();
    const payload = audit!.payloadJson as { group?: string; diff?: Record<string, string>; sensitive?: string[] };
    expect(payload.group).toBe("smtp");
    expect(Object.keys(payload.diff ?? {}).sort()).toEqual([...SMTP_KEYS].sort());
    expect(payload.sensitive).toContain("smtp.password");
    expect(JSON.stringify(payload)).not.toContain("brand-new-pw");
    expect(JSON.stringify(payload)).not.toContain("smtp2.test.local");
  });

  it("敏感字段空输入=保持原值且不进 diff;未变字段不进 diff", async () => {
    await saveGroup(
      "smtp",
      { host: "smtp3.test.local", port: 25, user: "u3", password: "", from: "ops2@lokta.local" },
      { id: ADMIN_ID },
    );
    const row = await prisma.systemConfig.findUnique({
      where: { key: "smtp.password" },
      select: { value: true },
    });
    expect(row?.value).toBe("brand-new-pw");
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect(Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff).sort()).toEqual(
      ["smtp.host", "smtp.from", "smtp.port", "smtp.user"].sort(),
    );
  });

  it("非法组名 422 VALIDATION_FAILED", async () => {
    const result = await saveGroup("bogus-group", { x: 1 }, { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("组内 zod 422(port 非数字),零写入", async () => {
    const result = await saveGroup(
      "smtp",
      { host: "h", port: "abc", user: "", password: "", from: "a@b.com" },
      { id: ADMIN_ID },
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((await prisma.systemConfig.findUnique({ where: { key: "smtp.host" } }))?.value).toBe(
      "smtp3.test.local",
    );
  });

  it("turnstile enabled=true 无密钥 → 422 TURNSTILE_KEYS_REQUIRED,零写入", async () => {
    await delKeys(TURNSTILE_KEYS);
    const result = await saveGroup(
      "turnstile",
      { enabled: true, siteKey: "", secretKey: "" },
      { id: ADMIN_ID },
    );
    expect(result).toMatchObject({ ok: false, code: "TURNSTILE_KEYS_REQUIRED" });
    expect(await prisma.systemConfig.count({ where: { key: { in: TURNSTILE_KEYS } } })).toBe(0);
  });

  it("turnstile 带双密钥保存 → getConfig 热生效 enabled:true;secretKey 空=保持", async () => {
    await saveGroup(
      "turnstile",
      { enabled: true, siteKey: "sk-1", secretKey: "sec-1" },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).turnstile).toMatchObject({ enabled: true, siteKey: "sk-1" });
    await saveGroup("turnstile", { enabled: true, siteKey: "sk-2", secretKey: "" }, { id: ADMIN_ID });
    expect((await getConfig()).turnstile).toMatchObject({ enabled: true, siteKey: "sk-2", secretKey: "sec-1" });
  });

  it("security/notify 组保存 → reloadSystemConfig 热生效(getConfig 反映新值)", async () => {
    await saveGroup(
      "security",
      { loginMaxFails: 7, loginWindowSec: 600, loginLockSec: 300 },
      { id: ADMIN_ID },
    );
    await saveGroup("notify", { pointEmailThreshold: 120 }, { id: ADMIN_ID });
    const config = await getConfig();
    expect(config.security).toEqual({ loginMaxFails: 7, loginWindowSec: 600, loginLockSec: 300 });
    expect(config.notify.pointEmailThreshold).toBe(120);
  });

  it("umami 组:apiPassword 空=保持原值,非空=覆写", async () => {
    await setKeys({
      "umami.scriptUrl": "https://stats.test.local/script.js",
      "umami.websiteId": "wid-9",
      "umami.apiUrl": "https://stats.test.local/api",
      "umami.apiUsername": "viewer",
      "umami.apiPassword": "keep-me-pw",
    });
    await saveGroup(
      "umami",
      { scriptUrl: "https://stats2.test.local/script.js", websiteId: "wid-10", apiUrl: "https://stats2.test.local/api", apiUsername: "viewer2", apiPassword: "" },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).umami).toMatchObject({ websiteId: "wid-10", apiPassword: "keep-me-pw" });
    await saveGroup(
      "umami",
      { scriptUrl: "https://stats2.test.local/script.js", websiteId: "wid-10", apiUrl: "https://stats2.test.local/api", apiUsername: "viewer2", apiPassword: "rotated-pw" },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).umami?.apiPassword).toBe("rotated-pw");
  });
});

describe("site/download 组(CRUD 对齐审计)", () => {
  it("键缺失 → 默认值兜底(旧站事实):ICP/QQ 群与四卡默认指向教程页", async () => {
    await delKeys([...SITE_KEYS, ...DOWNLOAD_KEYS]);
    const config = await getConfig();
    expect(config.site).toEqual({ icp: "京ICP备2022035466号", qqGroup: "184670219" });
    expect(config.download).toMatchObject({
      clientUrl: "/tutorial",
      launcherUrl: "/tutorial",
      addonUrl: "/tutorial",
      yyNote: "频道号见公告",
    });
    const view = await getSettingsView();
    expect(view.site).toEqual(config.site);
    expect(view.download).toEqual(config.download);
  });

  it("site 组保存 → 落库+热生效;审计只落键名不落值", async () => {
    const result = await saveGroup(
      "site",
      { icp: "京ICP备E2E000001号", qqGroup: "12345678" },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).site).toEqual({ icp: "京ICP备E2E000001号", qqGroup: "12345678" });
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect((audit!.payloadJson as { group?: string }).group).toBe("site");
    expect(Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff).sort()).toEqual(
      ["site.icp", "site.qqGroup"].sort(),
    );
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("京ICP备E2E000001号");
  });

  it("download 组:非法链接 422 零写入;合法保存热生效;留空=卡片隐藏语义", async () => {
    const bad = await saveGroup(
      "download",
      { clientUrl: "ftp://x", clientNote: "", launcherUrl: "", launcherNote: "", addonUrl: "", addonNote: "", yyNote: "" },
      { id: ADMIN_ID },
    );
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(await prisma.systemConfig.count({ where: { key: { in: DOWNLOAD_KEYS } } })).toBe(0);

    const badQq = await saveGroup("site", { icp: "", qqGroup: "abc12" }, { id: ADMIN_ID });
    expect(badQq).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });

    await saveGroup(
      "download",
      { clientUrl: "/tutorial#e2e", clientNote: "E2E 客户端", launcherUrl: "", launcherNote: "", addonUrl: "https://cdn.example.com/a.zip", addonNote: "", yyNote: "" },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).download).toMatchObject({
      clientUrl: "/tutorial#e2e",
      launcherUrl: "",
      addonUrl: "https://cdn.example.com/a.zip",
    });
  });
});

describe("home 组(轮播间隔+成就嵌入)", () => {
  it("键缺失 → 默认值兜底:轮播 5 秒+成就空隐藏+高度 185vh", async () => {
    await delKeys(HOME_KEYS);
    expect((await getConfig()).home).toEqual({
      achievementUrl: "",
      achievementHeight: "185vh",
      achievementScrolling: false,
      carouselIntervalSec: 5,
    });
  });

  it("轮播间隔单独提交:缺省字段保持现值;diff 只含变更键", async () => {
    await saveGroup(
      "home",
      {
        achievementUrl: "https://rank.lokta.local/achievement",
        achievementHeight: "120vh",
        achievementScrolling: true,
        carouselIntervalSec: 5,
      },
      { id: ADMIN_ID },
    );
    const result = await saveGroup("home", { carouselIntervalSec: 2 }, { id: ADMIN_ID });
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).home).toEqual({
      achievementUrl: "https://rank.lokta.local/achievement",
      achievementHeight: "120vh",
      achievementScrolling: true,
      carouselIntervalSec: 2,
    });
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect((audit!.payloadJson as { group?: string }).group).toBe("home");
    expect(Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff)).toEqual(
      ["home.carouselIntervalSec"],
    );
  });

  it("轮播间隔越界(0/61/2.5)422 零写入", async () => {
    for (const bad of [0, 61, 2.5]) {
      const result = await saveGroup("home", { carouselIntervalSec: bad }, { id: ADMIN_ID });
      expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    }
    expect(
      (await prisma.systemConfig.findUnique({ where: { key: "home.carouselIntervalSec" } }))?.value,
    ).toBe("2");
  });
});

describe("sendTestMail(T029)", () => {
  it("成功:直发不入 outbox,审计 SETTINGS_TEST_MAIL 记 to+ok", async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: "m-1" });
    const outboxBefore = await prisma.mailOutbox.count();
    const result = await sendTestMail("who@lokta.local", { id: ADMIN_ID });
    expect(result).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "who@lokta.local", from: "ops2@lokta.local" }),
    );
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_TEST_MAIL);
    expect(audit?.payloadJson).toMatchObject({ to: "who@lokta.local", ok: true });
    expect(await prisma.mailOutbox.count()).toBe(outboxBefore);
  });

  it("失败:业务结果回显(ok:false+摘要),不抛 5xx;审计记失败;摘要不含凭据", async () => {
    // 错误串刻意嵌入当前 SMTP 密码,验证 sendTestMail 回显前按配置值脱敏
    sendMailMock.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 127.0.0.1:1 (login:brand-new-pw)"),
    );
    const result = await sendTestMail("who@lokta.local", { id: ADMIN_ID });
    expect(result.ok).toBe(false);
    expect((result as { error: string }).error).toContain("ECONNREFUSED");
    expect((result as { error: string }).error).not.toContain("brand-new-pw");
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_TEST_MAIL);
    expect(audit?.payloadJson).toMatchObject({ to: "who@lokta.local", ok: false });
    expect(JSON.stringify(audit?.payloadJson)).not.toContain("brand-new-pw");
  });
});
