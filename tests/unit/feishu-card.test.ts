import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { buildFeishuPayload, sendFeishuCard } from "@/server/services/shared/feishu-card";

/**
 * 飞书卡片发送单测(2026-11-08 发货失败告警):
 * ① 签名口径与飞书自定义机器人一致(base64(HMAC-SHA256(`${timestamp}\n${secret}`, "")));
 * ② 2xx 仍须校验 body.code(19021 签名不符是业务拒绝,不是 HTTP 错误);
 * ③ 网络/5xx 视为瞬时,重试一次;未配置不视为错误。
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

describe("飞书卡片载荷", () => {
  it("标题/键值/主体/脚注齐备,字段两列排布", () => {
    const payload = buildFeishuPayload({
      title: "商城发货失败",
      template: "red",
      fields: [
        { label: "订单号", value: "42" },
        { label: "用户", value: "someone" },
      ],
      body: "**失败原因**\nDELIVERY_NO_HANDLER",
      note: "老克塔运营告警",
    });
    expect(payload.msg_type).toBe("interactive");
    const card = payload.card as {
      header: { template: string; title: { content: string } };
      elements: { tag: string; fields?: { is_short: boolean }[] }[];
    };
    expect(card.header.template).toBe("red");
    expect(card.header.title.content).toBe("商城发货失败");
    const fields = card.elements[0]?.fields ?? [];
    expect(fields).toHaveLength(2);
    expect(fields[0]?.is_short).toBe(true);
    expect(card.elements.map((e) => e.tag)).toEqual(["div", "div", "note"]);
  });
});

describe("飞书卡片发送", () => {
  it("未配置 webhook → not_configured(不算失败,不发请求)", async () => {
    const spy = vi.fn();
    globalThis.fetch = spy as unknown as typeof fetch;
    const result = await sendFeishuCard("", null, { title: "t" });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("带密钥时按飞书口径加签(timestamp + sign)", async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ code: 0 });
    }) as unknown as typeof fetch;

    const result = await sendFeishuCard("https://open.feishu.cn/hook/x", "s3cret", {
      title: "t",
    });
    expect(result.ok).toBe(true);
    expect(typeof body.timestamp).toBe("string");
    const expected = createHmac("sha256", `${body.timestamp}\ns3cret`).update("").digest("base64");
    expect(body.sign).toBe(expected);
  });

  it("2xx 但 body.code≠0 → rejected(飞书业务拒绝码)", async () => {
    globalThis.fetch = (async () => jsonResponse({ code: 19021, msg: "sign match fail" })) as unknown as typeof fetch;
    const result = await sendFeishuCard("https://open.feishu.cn/hook/x", null, { title: "t" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("rejected");
      expect(result.detail).toContain("19021");
    }
  });

  it("5xx 视为瞬时:重试一次仍失败 → unreachable", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("boom", { status: 502 });
    }) as unknown as typeof fetch;
    const result = await sendFeishuCard("https://open.feishu.cn/hook/x", null, { title: "t" });
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unreachable");
  });

  it("网络异常重试后成功 → ok", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
      return jsonResponse({ code: 0 });
    }) as unknown as typeof fetch;
    const result = await sendFeishuCard("https://open.feishu.cn/hook/x", null, { title: "t" });
    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
  });
});
