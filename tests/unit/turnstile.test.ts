import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();

vi.mock("@/lib/config", () => ({ getConfig: () => getConfig() }));

import { verifyTurnstile } from "@/lib/turnstile";

/** T007:siteverify 封装三态(成功/失败/网络异常)+关态直通(mock fetch) */
function stubFetch(
  impl: (url: string | URL, init?: RequestInit) => Promise<Response>,
) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const siteverify = (): Response =>
  new Response(JSON.stringify({ success: true }), { status: 200 });

describe("verifyTurnstile(T007)", () => {
  beforeEach(() => {
    getConfig.mockReset();
    vi.unstubAllGlobals();
  });

  it("未配置/enabled=false → 直通,不发起 fetch", async () => {
    getConfig.mockResolvedValue({ turnstile: undefined });
    let called = 0;
    stubFetch(async () => {
      called += 1;
      return siteverify();
    });
    await expect(verifyTurnstile("tok")).resolves.toEqual({ ok: true });

    getConfig.mockResolvedValue({
      turnstile: { enabled: false, siteKey: "k", secretKey: "s" },
    });
    await expect(verifyTurnstile("")).resolves.toEqual({ ok: true });
    expect(called).toBe(0);
  });

  it("enabled=true:form-encoded 提交;成功/恒失败/无 token 三态", async () => {
    getConfig.mockResolvedValue({
      turnstile: { enabled: true, siteKey: "site", secretKey: "sec" },
    });
    let captured = "";
    stubFetch(async (_url, init?: RequestInit) => {
      captured = String(init?.body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    await expect(verifyTurnstile("tok", "1.2.3.4")).resolves.toEqual({
      ok: true,
    });
    expect(captured).toContain("secret=sec");
    expect(captured).toContain("response=tok");
    expect(captured).toContain("remoteip=1.2.3.4");

    stubFetch(
      async () =>
        new Response(
          JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }),
          { status: 200 },
        ),
    );
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      errors: ["invalid-input-response"],
    });

    await expect(verifyTurnstile("")).resolves.toEqual({
      ok: false,
      errors: ["missing-input-response"],
    });
  });

  it("网络异常/非 200 → 按失败处理,不抛未捕获", async () => {
    getConfig.mockResolvedValue({
      turnstile: { enabled: true, siteKey: "site", secretKey: "sec" },
    });
    stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      errors: ["network-error"],
    });

    stubFetch(async () => new Response("oops", { status: 502 }));
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      errors: ["http-502"],
    });
  });
});
