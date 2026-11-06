import { describe, expect, it } from "vitest";
import { buildConfigFromRows } from "@/lib/config";

/** T003:config 扩组(turnstile/security/notify/backup)——键缺省语义单测 */
const BASE_ROWS: [string, string][] = [
  ["app.url", "https://lokta.cn"],
  ["soap.url", "http://127.0.0.1:7878"],
  ["soap.user", "admin"],
  ["soap.password", "secret"],
  ["smtp.host", "smtp.163.com"],
  ["smtp.port", "465"],
  ["smtp.from", "noreply@lokta.cn"],
  ["gamedb.auth", "mysql://u:p@127.0.0.1:3306/acore_auth"],
  ["gamedb.characters", "mysql://u:p@127.0.0.1:3306/acore_characters"],
  ["gamedb.world", "mysql://u:p@127.0.0.1:3306/acore_world"],
  ["gamedb.eluna", "mysql://u:p@127.0.0.1:3306/acore_eluna"],
];

function rows(...extra: [string, string][]) {
  return [...BASE_ROWS, ...extra].map(([key, value]) => ({ key, value }));
}

describe("buildConfigFromRows M4 五组(T003)", () => {
  it("新五键全缺省可启动:security/notify 取默认,turnstile 组恒存在且为关闭态", () => {
    const c = buildConfigFromRows(rows());
    expect(c.security).toEqual({
      loginMaxFails: 5,
      loginWindowSec: 900,
      loginLockSec: 900,
      trustedProxyHops: 1,
    });
    expect(c.notify).toEqual({ pointEmailThreshold: 0 });
    expect(c.turnstile).toEqual({
      enabled: false,
      siteKey: "",
      secretKey: "",
      misconfigured: false,
    });
    expect(c.backup).toBeUndefined();
    expect(c.cos).toBeUndefined();
  });

  it("显式配置 security/notify 数值生效(字符串 coerce)", () => {
    const c = buildConfigFromRows(
      rows(
        ["security.loginMaxFails", "3"],
        ["security.loginWindowSec", "600"],
        ["security.loginLockSec", "300"],
        ["notify.pointEmailThreshold", "50"],
      ),
    );
    expect(c.security).toEqual({
      loginMaxFails: 3,
      loginWindowSec: 600,
      loginLockSec: 300,
      trustedProxyHops: 1,
    });
    expect(c.notify.pointEmailThreshold).toBe(50);
  });

  it("turnstile 全键在=配置可用;enabled=false 无密钥不阻塞(关闭直通)", () => {
    const off = buildConfigFromRows(rows(["turnstile.enabled", "false"]));
    expect(off.turnstile).toEqual({
      enabled: false,
      siteKey: "",
      secretKey: "",
      misconfigured: false,
    });

    const on = buildConfigFromRows(
      rows(
        ["turnstile.enabled", "true"],
        ["turnstile.siteKey", "0xAAA"],
        ["turnstile.secretKey", "0xBBB"],
      ),
    );
    expect(on.turnstile).toEqual({
      enabled: true,
      siteKey: "0xAAA",
      secretKey: "0xBBB",
      misconfigured: false,
    });
  });

  it("turnstile.enabled=true 而密钥缺失 → 不抛错,标 misconfigured(整站不再 500)", () => {
    const c = buildConfigFromRows(
      rows(["turnstile.enabled", "true"], ["turnstile.siteKey", "0xAAA"]),
    );
    expect(c.turnstile).toEqual({
      enabled: true,
      siteKey: "0xAAA",
      secretKey: "",
      misconfigured: true,
    });
  });

  it("appearance 缺省回落内置资源;显式留空=隐藏背景;非法协议校验失败", () => {
    const defaults = buildConfigFromRows(rows());
    expect(defaults.appearance).toEqual({
      logoUrl: "/logo.png",
      faviconUrl: "/favicon-32.png",
      headerBackgroundUrl: "/background.jpg",
      pageBackgroundUrl: "/background.jpg",
    });

    const hidden = buildConfigFromRows(
      rows(["appearance.headerBackgroundUrl", ""], ["appearance.pageBackgroundUrl", ""]),
    );
    expect(hidden.appearance.headerBackgroundUrl).toBe("");
    expect(hidden.appearance.pageBackgroundUrl).toBe("");

    expect(() => buildConfigFromRows(rows(["appearance.logoUrl", "javascript:alert(1)"]))).toThrow(
      /system_config 配置校验失败/,
    );
  });

  it("backup 可只给 gameWeekly(retentionDays 取默认 30);retentionDays=0 合法", () => {
    const partial = buildConfigFromRows(rows(["backup.gameWeekly", "false"]));
    expect(partial.backup).toEqual({ retentionDays: 30, gameWeekly: false });

    const zero = buildConfigFromRows(rows(["backup.retentionDays", "0"]));
    expect(zero.backup).toEqual({ retentionDays: 0, gameWeekly: true });
  });
});

/** 主题系统(2026-11-06):theme 组 flat-dotted 形状 + 默认值 + 脏 active 回落 */
describe("buildConfigFromRows theme 组(主题系统)", () => {
  it("全键缺省取默认:active=tbc,TBC 背景留空回落 appearance,WLK 取内置冷色资源", () => {
    const c = buildConfigFromRows(rows());
    expect(c.theme).toEqual({
      active: "tbc",
      "tbc.headerBackgroundUrl": "",
      "tbc.pageBackgroundUrl": "",
      "tbc.panelBackgroundUrl": "",
      "wlk.headerBackgroundUrl": "/images/banner-wotlk.svg",
      "wlk.pageBackgroundUrl": "/background.jpg",
      "wlk.panelBackgroundUrl": "",
    });
  });

  it("显式配置生效:active=wlk + 两套主题各自的页头/页面/面板背景", () => {
    const c = buildConfigFromRows(
      rows(
        ["theme.active", "wlk"],
        ["theme.tbc.headerBackgroundUrl", "/images/tbc-head.svg"],
        ["theme.tbc.pageBackgroundUrl", "/images/tbc-page.svg"],
        ["theme.tbc.panelBackgroundUrl", "/images/tbc-panel.svg"],
        ["theme.wlk.headerBackgroundUrl", "/images/wlk-head.svg"],
        ["theme.wlk.pageBackgroundUrl", "/images/wlk-page.svg"],
        ["theme.wlk.panelBackgroundUrl", "/images/wlk-panel.svg"],
      ),
    );
    expect(c.theme.active).toBe("wlk");
    expect(c.theme["tbc.headerBackgroundUrl"]).toBe("/images/tbc-head.svg");
    expect(c.theme["wlk.panelBackgroundUrl"]).toBe("/images/wlk-panel.svg");
  });

  it("active 为非法 id 回落默认主题(单行脏数据不应让整站配置校验失败)", () => {
    const c = buildConfigFromRows(rows(["theme.active", "cataclysm"]));
    expect(c.theme.active).toBe("tbc");
  });

  it("背景地址非法协议 → 校验失败(防 javascript: 注入进内联样式)", () => {
    expect(() =>
      buildConfigFromRows(rows(["theme.tbc.pageBackgroundUrl", "javascript:alert(1)"])),
    ).toThrow(/system_config 配置校验失败/);
  });
});
