import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));

// SMTP 通道 mock(T029 任务口径:测试发信成功/失败两态 mock transporter;
// 其余依赖 dev 库/redis 直连不 mock)
vi.mock("@/lib/mail", () => ({
  getTransporter: async () => ({ sendMail: sendMailMock }),
}));

import { prisma } from "@/lib/db/business";
import { DEFAULT_SITE_COPYRIGHT_EN, reloadSystemConfig, getConfig } from "@/lib/config";
import { AUDIT_ACTION } from "@/constants/audit";
import { getSettingsView } from "@/server/services/settings/view";
import { saveSettingsGroup as saveGroup, sendTestMail } from "@/server/services/settings/save";
import { getActiveTheme } from "@/server/services/site/theme";

/**
 * T029:设置服务集成——GET 掩码态(无明文)/PUT 组校验 422/敏感字段空=保持非空=覆写/
 * 保存后 reloadSystemConfig 热生效/审计 SETTINGS_CHANGED 无值落盘/test-mail 成功失败两态。
 * system_config 共享键:用前快照、用后还原(admin-stats 先例)。
 */

const ADMIN_ID = 3n;

const SMTP_KEYS = ["smtp.host", "smtp.port", "smtp.user", "smtp.password", "smtp.from"];
const CAPTCHA_KEYS = [
  "captcha.enabled",
  "captcha.appId",
  "captcha.appSecret",
  "captcha.secretId",
  "captcha.secretKey",
];
const SECURITY_KEYS = [
  "security.loginMaxFails",
  "security.loginWindowSec",
  "security.loginLockSec",
  "security.trustedProxyHops",
  "security.loginIpSoftFails",
  "security.loginIpMaxFails",
  "security.loginIpLockSec",
  "security.loginSoftLockSec",
  "security.loginGlobalMaxPerMin",
  "security.loginMaxConcurrent",
  "security.loginQueueWaitMs",
  "security.loginUnknownIpMaxPerMin",
  "security.registerIpMaxPerHour",
  "security.pwresetIpMaxPerHour",
  "security.emailChangeIpMaxPerHour",
  "security.unknownIpMaxPerHour",
  "security.statusIpMaxPerMin",
  "security.statusGlobalMaxPerMin",
  "security.statusUnknownIpMaxPerMin",
  "security.artviewIpMaxPerMin",
  "security.artviewArticleMax",
  "security.artviewArticleWindowSec",
  "security.trackUnknownIpMaxPerMin",
];
const NOTIFY_KEYS = ["notify.pointEmailThreshold"];
const SITE_KEYS = [
  "site.icp",
  "site.copyrightEn",
  "site.qqGroup",
  "site.qqGroupQr",
  "site.qqGroupJoinUrl",
];
const HOME_KEYS = [
  "home.achievementUrl",
  "home.achievementHeight",
  "home.achievementScrolling",
  "home.carouselIntervalSec",
];
const CONTENT_KEYS = ["content.tocEnabled"];
const THEME_KEYS = [
  "theme.active",
  "theme.tbc.headerBackgroundUrl",
  "theme.tbc.pageBackgroundUrl",
  "theme.tbc.panelBackgroundUrl",
  "theme.wlk.headerBackgroundUrl",
  "theme.wlk.pageBackgroundUrl",
  "theme.wlk.panelBackgroundUrl",
];
const ALL_KEYS = [
  ...SMTP_KEYS,
  ...CAPTCHA_KEYS,
  ...SECURITY_KEYS,
  ...NOTIFY_KEYS,
  ...SITE_KEYS,
  ...HOME_KEYS,
  ...CONTENT_KEYS,
  ...THEME_KEYS,
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
      "captcha.enabled": "true",
      "captcha.appId": "1234567",
      "captcha.appSecret": "captcha-plain-secret",
      "captcha.secretId": "AKID-test",
      "captcha.secretKey": "captcha-plain-sk",
    });
    const view = await getSettingsView();
    expect(view.smtp.passwordConfigured).toBe(true);
    expect(view.captcha).toMatchObject({
      enabled: true,
      appId: "1234567",
      secretId: "AKID-test",
      appSecretConfigured: true,
      secretKeyConfigured: true,
    });
    const dumped = JSON.stringify(view);
    expect(dumped).not.toContain("plain-secret-pw");
    expect(dumped).not.toContain("captcha-plain-secret");
    expect(dumped).not.toContain("captcha-plain-sk");
  });

  it("未配置:captcha 走关闭态", async () => {
    await delKeys(CAPTCHA_KEYS);
    const view = await getSettingsView();
    expect(view.captcha).toEqual({
      enabled: false,
      appId: null,
      secretId: null,
      appSecretConfigured: false,
      secretKeyConfigured: false,
      misconfigured: false,
    });
  });

  it("启用但四件套缺失:标 misconfigured(后台出告警,登录端点失败关闭)", async () => {
    await setKeys({
      "captcha.enabled": "true",
      "captcha.appId": "1234567",
    });
    const view = await getSettingsView();
    expect(view.captcha.misconfigured).toBe(true);
  });
});

describe("saveSettingsGroup(T029)", () => {
  it("smtp 全量保存:覆写+审计 SETTINGS_CHANGED 只落键名不落值", async () => {
    const result = await saveGroup(
      "smtp",
      {
        host: "smtp2.test.local",
        port: 587,
        user: "u2",
        password: "brand-new-pw",
        from: "ops@lokta.local",
      },
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
    const payload = audit!.payloadJson as {
      group?: string;
      diff?: Record<string, string>;
      sensitive?: string[];
    };
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
    expect(
      Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff).sort(),
    ).toEqual(["smtp.host", "smtp.from", "smtp.port", "smtp.user"].sort());
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

  it("captcha enabled=true 四件套不齐 → 422 CAPTCHA_KEYS_REQUIRED,零写入", async () => {
    await delKeys(CAPTCHA_KEYS);
    const result = await saveGroup(
      "captcha",
      { enabled: true, appId: "", appSecret: "", secretId: "", secretKey: "" },
      { id: ADMIN_ID },
    );
    expect(result).toMatchObject({ ok: false, code: "CAPTCHA_KEYS_REQUIRED" });
    expect(await prisma.systemConfig.count({ where: { key: { in: CAPTCHA_KEYS } } })).toBe(0);
  });

  it("captcha 带四件套保存 → getConfig 热生效 enabled:true;appSecret/secretKey 空=保持", async () => {
    await saveGroup(
      "captcha",
      {
        enabled: true,
        appId: "1234567",
        appSecret: "app-secret-1",
        secretId: "AKID-1",
        secretKey: "sk-1",
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).captcha).toMatchObject({
      enabled: true,
      appId: "1234567",
      appSecret: "app-secret-1",
      secretId: "AKID-1",
      secretKey: "sk-1",
    });
    await saveGroup(
      "captcha",
      {
        enabled: true,
        appId: "7654321",
        appSecret: "",
        secretId: "AKID-2",
        secretKey: "",
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).captcha).toMatchObject({
      enabled: true,
      appId: "7654321",
      appSecret: "app-secret-1",
      secretId: "AKID-2",
      secretKey: "sk-1",
    });
  });

  it("security/notify 组保存 → reloadSystemConfig 热生效(getConfig 反映新值)", async () => {
    // 全量提交:16 键显式落库,断言不依赖库里既有值(E2E 预置会改写这些行)
    await saveGroup(
      "security",
      {
        loginMaxFails: 7,
        loginWindowSec: 600,
        loginLockSec: 300,
        trustedProxyHops: 1,
        loginIpSoftFails: 20,
        loginIpMaxFails: 50,
        loginIpLockSec: 900,
        loginSoftLockSec: 2,
        loginGlobalMaxPerMin: 60,
        loginMaxConcurrent: 4,
        loginQueueWaitMs: 1500,
        loginUnknownIpMaxPerMin: 600,
        registerIpMaxPerHour: 10,
        pwresetIpMaxPerHour: 20,
        emailChangeIpMaxPerHour: 20,
        unknownIpMaxPerHour: 6000,
        statusIpMaxPerMin: 30,
        statusGlobalMaxPerMin: 120,
        statusUnknownIpMaxPerMin: 600,
        artviewIpMaxPerMin: 60,
        artviewArticleMax: 1,
        artviewArticleWindowSec: 600,
        trackUnknownIpMaxPerMin: 600,
      },
      { id: ADMIN_ID },
    );
    await saveGroup("notify", { pointEmailThreshold: 120 }, { id: ADMIN_ID });
    const config = await getConfig();
    expect(config.security).toEqual({
      loginMaxFails: 7,
      loginWindowSec: 600,
      loginLockSec: 300,
      trustedProxyHops: 1,
      loginIpSoftFails: 20,
      loginIpMaxFails: 50,
      loginIpLockSec: 900,
      loginSoftLockSec: 2,
      loginGlobalMaxPerMin: 60,
      loginMaxConcurrent: 4,
      loginQueueWaitMs: 1500,
      loginUnknownIpMaxPerMin: 600,
      registerIpMaxPerHour: 10,
      pwresetIpMaxPerHour: 20,
      emailChangeIpMaxPerHour: 20,
      unknownIpMaxPerHour: 6000,
      statusIpMaxPerMin: 30,
      statusGlobalMaxPerMin: 120,
      statusUnknownIpMaxPerMin: 600,
      artviewIpMaxPerMin: 60,
      artviewArticleMax: 1,
      artviewArticleWindowSec: 600,
      trackUnknownIpMaxPerMin: 600,
    });
    expect(config.notify.pointEmailThreshold).toBe(120);
  });

  it("security 组部分提交:未带的字段保持现值(组级全量提交口径)", async () => {
    await saveGroup("security", { loginIpMaxFails: 80 }, { id: ADMIN_ID });
    const config = await getConfig();
    expect(config.security.loginIpMaxFails).toBe(80);
    expect(config.security.loginMaxFails).toBe(7);
  });
});

describe("site 组(CRUD 对齐审计)", () => {
  it("键缺失 → 默认值兜底(旧站备案号/英文版权声明/QQ 群号)", async () => {
    await delKeys(SITE_KEYS);
    const config = await getConfig();
    expect(config.site).toEqual({
      icp: "京ICP备2022035466号",
      copyrightEn: DEFAULT_SITE_COPYRIGHT_EN,
      qqGroup: "184670219",
      // 默认=WP 原版页脚二维码素材迁移的 public/qq-group-qr.png
      qqGroupQr: "/qq-group-qr.png",
      // 默认=WP 原站群号加群短链(issue #95 恢复原站点行为)
      qqGroupJoinUrl: "https://qm.qq.com/q/hz9TWpqU2A",
    });
    const view = await getSettingsView();
    expect(view.site).toEqual(config.site);
  });

  it("site 组保存 → 落库+热生效;审计只落键名不落值", async () => {
    const result = await saveGroup(
      "site",
      { icp: "京ICP备E2E000001号", qqGroup: "10086100", qqGroupQr: "/uploads/qq-qr.png" },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).site).toEqual({
      icp: "京ICP备E2E000001号",
      // copyrightEn 缺省=保持(无行则回落默认),不进 diff;qqGroupJoinUrl 同缺省=回落默认
      copyrightEn: DEFAULT_SITE_COPYRIGHT_EN,
      qqGroup: "10086100",
      qqGroupQr: "/uploads/qq-qr.png",
      qqGroupJoinUrl: "https://qm.qq.com/q/hz9TWpqU2A",
    });
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect((audit!.payloadJson as { group?: string }).group).toBe("site");
    expect(
      Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff).sort(),
    ).toEqual(["site.icp", "site.qqGroup", "site.qqGroupQr"].sort());
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("京ICP备E2E000001号");
    // copyrightEn 覆写与显式清空(空串=页脚隐藏英文声明);
    // qqGroup 空串=侧栏隐藏 QQ 卡,qqGroupQr 空串=卡内不渲染二维码
    await saveGroup(
      "site",
      {
        icp: "京ICP备E2E000001号",
        copyrightEn: "Custom EN line.",
        qqGroup: "10086100",
        qqGroupQr: "/uploads/qq-qr.png",
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).site.copyrightEn).toBe("Custom EN line.");
    await saveGroup(
      "site",
      {
        icp: "京ICP备E2E000001号",
        copyrightEn: "",
        qqGroup: "10086100",
        qqGroupQr: "/uploads/qq-qr.png",
      },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).site.copyrightEn).toBe("");
    await saveGroup(
      "site",
      { icp: "京ICP备E2E000001号", qqGroup: "", qqGroupQr: "", qqGroupJoinUrl: "" },
      { id: ADMIN_ID },
    );
    expect((await getConfig()).site.qqGroup).toBe("");
    expect((await getConfig()).site.qqGroupQr).toBe("");
    // 加群链接空串=显式清空(群号回落点击复制)
    expect((await getConfig()).site.qqGroupJoinUrl).toBe("");
  });

  it("site 组:icp 超长/QQ 群号非数字/二维码非法地址 422 零写入", async () => {
    const badIcp = await saveGroup(
      "site",
      { icp: "x".repeat(65), qqGroup: "10086100", qqGroupQr: "" },
      { id: ADMIN_ID },
    );
    expect(badIcp).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    const badGroup = await saveGroup(
      "site",
      { icp: "京ICP备E2E000001号", qqGroup: "not-a-number", qqGroupQr: "" },
      { id: ADMIN_ID },
    );
    expect(badGroup).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    const badQr = await saveGroup(
      "site",
      { icp: "京ICP备E2E000001号", qqGroup: "10086100", qqGroupQr: "javascript:alert(1)" },
      { id: ADMIN_ID },
    );
    expect(badQr).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    const badJoin = await saveGroup(
      "site",
      {
        icp: "京ICP备E2E000001号",
        qqGroup: "10086100",
        qqGroupQr: "",
        qqGroupJoinUrl: "javascript:alert(1)",
      },
      { id: ADMIN_ID },
    );
    expect(badJoin).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((await getConfig()).site.icp).toBe("京ICP备E2E000001号");
    expect((await getConfig()).site.qqGroup).toBe("");
    expect((await getConfig()).site.qqGroupQr).toBe("");
    expect((await getConfig()).site.qqGroupJoinUrl).toBe("");
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
    expect(Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff)).toEqual([
      "home.carouselIntervalSec",
    ]);
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

describe("content 组(正文目录开关)", () => {
  it("键缺失 → 默认开启;关闭保存 → 热生效;视图同步;审计只落键名", async () => {
    await delKeys(CONTENT_KEYS);
    expect((await getConfig()).content.tocEnabled).toBe(true);
    expect((await getSettingsView()).content.tocEnabled).toBe(true);
    await saveGroup("content", { tocEnabled: false }, { id: ADMIN_ID });
    expect((await getConfig()).content.tocEnabled).toBe(false);
    expect((await getSettingsView()).content.tocEnabled).toBe(false);
    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect((audit!.payloadJson as { group?: string }).group).toBe("content");
    expect(Object.keys((audit!.payloadJson as { diff: Record<string, string> }).diff)).toEqual([
      "content.tocEnabled",
    ]);
    await saveGroup("content", { tocEnabled: true }, { id: ADMIN_ID });
    expect((await getConfig()).content.tocEnabled).toBe(true);
  });

  it("非布尔值 422 零写入", async () => {
    const result = await saveGroup("content", { tocEnabled: "yes" }, { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(
      (await prisma.systemConfig.findUnique({ where: { key: "content.tocEnabled" } }))?.value,
    ).toBe("true");
  });
});

describe("theme 组(主题切换,2026-11-06 主题系统)", () => {
  it("键缺失 → 默认 active=tbc,WLK 取内置冷色资源", async () => {
    await delKeys(THEME_KEYS);
    const view = await getSettingsView();
    expect(view.theme.active).toBe("tbc");
    expect(view.theme.assets.wlk.headerBackgroundUrl).toBe("/images/banner-wotlk.svg");
    expect(view.theme.assets.wlk.pageBackgroundUrl).toBe("/background.jpg");
  });

  it("切到 wlk + 配两套主题背景 → 落库热生效;视图与 getActiveTheme 同步", async () => {
    const result = await saveGroup(
      "theme",
      {
        active: "wlk",
        "tbc.headerBackgroundUrl": "/images/tbc-head.svg",
        "tbc.pageBackgroundUrl": "/images/tbc-page.svg",
        "tbc.panelBackgroundUrl": "/images/tbc-panel.svg",
        "wlk.headerBackgroundUrl": "/images/wlk-head.svg",
        "wlk.pageBackgroundUrl": "/images/wlk-page.svg",
        "wlk.panelBackgroundUrl": "/images/wlk-panel.svg",
      },
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect((await getConfig()).theme.active).toBe("wlk");

    const view = await getSettingsView();
    expect(view.theme.active).toBe("wlk");
    expect(view.theme.assets.tbc.headerBackgroundUrl).toBe("/images/tbc-head.svg");

    const active = await getActiveTheme();
    expect(active.id).toBe("wlk");
    expect(active.assets.panelBackgroundUrl).toBe("/images/wlk-panel.svg");

    const audit = await latestAudit(AUDIT_ACTION.SETTINGS_CHANGED);
    expect((audit!.payloadJson as { group?: string }).group).toBe("theme");
  });

  it("非法 active id / 非法背景地址 422 零写入", async () => {
    const bad = await saveGroup("theme", { active: "cataclysm" }, { id: ADMIN_ID });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    const badUrl = await saveGroup(
      "theme",
      { "wlk.pageBackgroundUrl": "javascript:alert(1)" },
      { id: ADMIN_ID },
    );
    expect(badUrl).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect((await getConfig()).theme.active).toBe("wlk");
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
