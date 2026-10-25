import { describe, expect, it } from "vitest";
import { buildConfigFromRows } from "@/lib/config";

/** T003:config 扩 5 组(turnstile/security/notify/umami/backup)——键缺省语义单测 */
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
  it("新五键全缺省可启动:security/notify 取默认,四个 optional 组为 undefined", () => {
    const c = buildConfigFromRows(rows());
    expect(c.security).toEqual({
      loginMaxFails: 5,
      loginWindowSec: 900,
      loginLockSec: 900,
    });
    expect(c.notify).toEqual({ pointEmailThreshold: 0 });
    expect(c.turnstile).toBeUndefined();
    expect(c.umami).toBeUndefined();
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
    });
    expect(c.notify.pointEmailThreshold).toBe(50);
  });

  it("turnstile 全键在=配置可用;enabled=false 无密钥不阻塞(关闭直通)", () => {
    const off = buildConfigFromRows(
      rows(["turnstile.enabled", "false"]),
    );
    expect(off.turnstile).toEqual({
      enabled: false,
      siteKey: "",
      secretKey: "",
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
    });
  });

  it("turnstile.enabled=true 而密钥缺失 → 配置校验失败(422 TURNSTILE_KEYS_REQUIRED 同语义)", () => {
    expect(() =>
      buildConfigFromRows(
        rows(
          ["turnstile.enabled", "true"],
          ["turnstile.siteKey", "0xAAA"],
        ),
      ),
    ).toThrow(/siteKey\/secretKey 必填/);
  });

  it("umami 五键齐全=配置可用;只给部分键 → 校验失败(fail-fast 防半配置)", () => {
    const full = buildConfigFromRows(
      rows(
        ["umami.scriptUrl", "https://stats.lokta.cn/script.js"],
        ["umami.websiteId", "wid-1"],
        ["umami.apiUrl", "https://stats.lokta.cn/api"],
        ["umami.apiUsername", "viewer"],
        ["umami.apiPassword", "pw"],
      ),
    );
    expect(full.umami?.websiteId).toBe("wid-1");

    expect(() =>
      buildConfigFromRows(rows(["umami.scriptUrl", "https://stats.lokta.cn/script.js"])),
    ).toThrow(/system_config 配置校验失败/);
  });

  it("backup 可只给 gameWeekly(retentionDays 取默认 30);retentionDays=0 合法", () => {
    const partial = buildConfigFromRows(rows(["backup.gameWeekly", "false"]));
    expect(partial.backup).toEqual({ retentionDays: 30, gameWeekly: false });

    const zero = buildConfigFromRows(rows(["backup.retentionDays", "0"]));
    expect(zero.backup).toEqual({ retentionDays: 0, gameWeekly: true });
  });
});
