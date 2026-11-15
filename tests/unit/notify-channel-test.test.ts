import { afterEach, describe, expect, it, vi } from "vitest";
import { testFeishuAlertChannel } from "@/server/services/settings/connection-test";

/**
 * 飞书告警通道「测试连接」单测:
 * 后台配置项只有「发一张测试卡片」才算真验过通道(握手类探测证明不了签名与地址都对),
 * 故这里锁三件事:地址缺失直接拦停、飞书业务拒绝要能读懂、成功要提示去群里确认。
 */
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("飞书告警通道测试", () => {
  it("未配置 Webhook 地址 → 拦停且不发请求", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const result = await testFeishuAlertChannel({ webhookUrl: "", webhookSecret: "" });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("未配置");
    expect(spy).not.toHaveBeenCalled();
  });

  it("发送成功 → 提示去飞书群确认收到(卡片真发出去了)", async () => {
    let payload: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ code: 0 });
    }) as unknown as typeof fetch;

    const result = await testFeishuAlertChannel({
      webhookUrl: "https://open.feishu.cn/hook/x",
      webhookSecret: "s3cret",
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("确认收到");
    // 真发了一张卡片(不是握手探测)
    const card = payload.card as { header: { title: { content: string } } };
    expect(card.header.title.content).toBe("告警通道测试");
    expect(typeof payload.sign).toBe("string");
  });

  it("飞书业务拒绝(如签名不符)→ 失败且原因可读", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({ code: 19021, msg: "sign match fail" })) as unknown as typeof fetch;
    const result = await testFeishuAlertChannel({
      webhookUrl: "https://open.feishu.cn/hook/x",
      webhookSecret: "wrong",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("飞书拒绝");
    expect(result.message).toContain("19021");
  });
});
