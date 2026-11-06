import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
/** 腾讯云 SDK 的 DescribeCaptchaResult 桩 */
const describeResult = vi.fn();

vi.mock("@/lib/config", () => ({ getConfig: () => getConfig() }));
vi.mock("tencentcloud-sdk-nodejs-captcha", () => {
  class Client {
    DescribeCaptchaResult = describeResult;
  }
  return { captcha: { v20190722: { Client } } };
});

import { verifyCaptcha } from "@/lib/captcha/tencent";

const FULL_CFG = {
  enabled: true,
  appId: "1234567",
  appSecret: "app-secret",
  secretId: "AKID-test",
  secretKey: "SK-test",
  misconfigured: false,
};

/** 验证码服务正常返回 CaptchaCode=1(验证通过) */
function stubOk() {
  describeResult.mockResolvedValue({ CaptchaCode: 1 });
}

describe("verifyCaptcha(腾讯云验证码)", () => {
  beforeEach(() => {
    getConfig.mockReset();
    describeResult.mockReset();
  });

  it("未启用 → 直通,不调腾讯云", async () => {
    getConfig.mockResolvedValue({
      captcha: { ...FULL_CFG, enabled: false, misconfigured: false },
    });
    await expect(verifyCaptcha("", "")).resolves.toEqual({
      ok: true,
      configured: false,
    });
    expect(describeResult).not.toHaveBeenCalled();
  });

  it("已启用但四件套缺失(misconfigured) → 失败关闭,不调腾讯云", async () => {
    getConfig.mockResolvedValue({
      captcha: { ...FULL_CFG, appSecret: "", misconfigured: true },
    });
    await expect(verifyCaptcha("ticket", "randstr")).resolves.toEqual({
      ok: false,
      errors: ["not-configured"],
      configured: false,
    });
    expect(describeResult).not.toHaveBeenCalled();
  });

  it("appId 非数字 → 视同未配置,失败关闭", async () => {
    getConfig.mockResolvedValue({
      captcha: { ...FULL_CFG, appId: "not-a-number", misconfigured: false },
    });
    await expect(verifyCaptcha("ticket", "randstr")).resolves.toEqual({
      ok: false,
      errors: ["not-configured"],
      configured: false,
    });
    expect(describeResult).not.toHaveBeenCalled();
  });

  it("缺票据 → 失败关闭,不调腾讯云", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    await expect(verifyCaptcha("", "randstr")).resolves.toEqual({
      ok: false,
      errors: ["missing-ticket"],
      configured: true,
    });
    await expect(verifyCaptcha("ticket", "")).resolves.toEqual({
      ok: false,
      errors: ["missing-ticket"],
      configured: true,
    });
    expect(describeResult).not.toHaveBeenCalled();
  });

  it("CaptchaCode=1 → 通过;请求参数含 appId/票据/客户端 IP", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    stubOk();
    await expect(verifyCaptcha("ticket-1", "rand-1", "1.2.3.4")).resolves.toEqual({
      ok: true,
      configured: true,
    });
    expect(describeResult).toHaveBeenCalledTimes(1);
    expect(describeResult.mock.calls[0]![0]).toMatchObject({
      CaptchaType: 9,
      Ticket: "ticket-1",
      Randstr: "rand-1",
      UserIp: "1.2.3.4",
      CaptchaAppId: 1234567,
      AppSecretKey: "app-secret",
    });
  });

  it("CaptchaCode≠1(如 7 票据不匹配) → 拒绝,带原因码", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    describeResult.mockResolvedValue({ CaptchaCode: 7 });
    await expect(verifyCaptcha("ticket", "randstr")).resolves.toEqual({
      ok: false,
      errors: ["code-7"],
      configured: true,
    });
  });

  it("CaptchaCode=26(验证码服务内部错误) → 按官方容灾方案降级放行", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    describeResult.mockResolvedValue({ CaptchaCode: 26 });
    await expect(verifyCaptcha("ticket", "randstr")).resolves.toEqual({
      ok: true,
      degraded: true,
      errors: ["code-26"],
      configured: true,
    });
  });

  it("CaptchaCode=21 且票据带 trerror 前缀(前端容灾票据) → 降级放行", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    describeResult.mockResolvedValue({ CaptchaCode: 21 });
    await expect(verifyCaptcha("trerror-ticket", "randstr")).resolves.toEqual({
      ok: true,
      degraded: true,
      errors: ["disaster-ticket"],
      configured: true,
    });
  });

  it("CaptchaCode=21 且非容灾票据(风控判定) → 拒绝", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    describeResult.mockResolvedValue({ CaptchaCode: 21 });
    await expect(verifyCaptcha("normal-ticket", "randstr")).resolves.toEqual({
      ok: false,
      errors: ["code-21"],
      configured: true,
    });
  });

  it("腾讯云接口异常/超时 → 降级放行(不把全站锁在登录门外)", async () => {
    getConfig.mockResolvedValue({ captcha: FULL_CFG });
    describeResult.mockRejectedValue(Object.assign(new Error("timeout"), { code: "RequestLimitExceeded" }));
    await expect(verifyCaptcha("ticket", "randstr")).resolves.toEqual({
      ok: true,
      degraded: true,
      errors: ["provider-unavailable"],
      configured: true,
    });
  });
});
