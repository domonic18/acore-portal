import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseBody } from "@/server/http";

/**
 * parseBody 的媒体类型闸(2026-11-07 CSRF 加固):
 * 只收 application/json —— 跨源浏览器简单请求只能带 text/plain 等类型,
 * 收紧后跨源写请求必然触发预检,浏览器直接拦下。
 */

const schema = z.object({ name: z.string() });

function req(contentType: string | null, body: string): Request {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers,
    body,
  });
}

async function code(res: Response): Promise<string> {
  const payload = (await res.json()) as { error: { code: string } };
  return payload.error.code;
}

describe("parseBody 媒体类型闸", () => {
  it("application/json 正常解析", async () => {
    const res = await parseBody(req("application/json", JSON.stringify({ name: "a" })), schema);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("a");
  });

  it("带 charset 参数的 application/json 也放行", async () => {
    const res = await parseBody(
      req("application/json; charset=utf-8", JSON.stringify({ name: "a" })),
      schema,
    );
    expect(res.ok).toBe(true);
  });

  it("text/plain → 415", async () => {
    const res = await parseBody(req("text/plain", JSON.stringify({ name: "a" })), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(415);
      expect(await code(res.response)).toBe("UNSUPPORTED_MEDIA_TYPE");
    }
  });

  it("表单编码 → 415", async () => {
    const res = await parseBody(
      req("application/x-www-form-urlencoded", "name=a"),
      schema,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(415);
  });

  it("缺 Content-Type → 415", async () => {
    const res = await parseBody(req(null, JSON.stringify({ name: "a" })), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(415);
  });

  it("媒体类型对但体不是合法 JSON → 仍是 422(语义错误不混淆)", async () => {
    const res = await parseBody(req("application/json", "not-json"), schema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.response.status).toBe(422);
      expect(await code(res.response)).toBe("VALIDATION_ERROR");
    }
  });
});
