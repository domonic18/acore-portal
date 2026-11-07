import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { PATCH as profilePatch } from "@/app/api/account/profile/route";

/**
 * 2026-11-07 CSRF 加固:
 * ① 跨源写请求(带 Origin)→ 403 CROSS_ORIGIN_BLOCKED,且不进入业务逻辑(不落库、不计限速);
 * ② 非 JSON 媒体类型 → 415(跨源浏览器简单请求面被斩断);
 * ③ 无 Origin/Referer 的非浏览器客户端 → 放行(拿不到 HttpOnly Cookie,不构成 CSRF)。
 *
 * 放行用例故意用「参数不合法」的请求体:过了来源闸即在 zod 校验处 422,
 * 既能证明闸门放行,又不产生任何落库副作用。
 */

const CROSS = "https://evil.example";
/** 独立来源 IP:与限速用例互不干扰 */
const IP = "198.51.100.77";

function post(
  url: string,
  body: unknown,
  init: { origin?: string; contentType?: string; referer?: string } = {},
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": init.contentType ?? "application/json",
    "x-forwarded-for": IP,
    // Host 是浏览器一定会带的请求头(真实部署由反代透传);测试里手工补上,
    // 否则来源闸只能靠 app.url 认同源
    host: "localhost",
  };
  if (init.origin) headers["origin"] = init.origin;
  if (init.referer) headers["referer"] = init.referer;
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

async function errCode(res: Response): Promise<string> {
  const payload = (await res.json()) as { error: { code: string } };
  return payload.error.code;
}

/** 参数非法的注册体:能过来源闸,但在 zod 处止步 */
const INVALID_BODY = { username: 123 };

describe("跨源写请求被拒", () => {
  it("注册:跨源 → 403", async () => {
    const res = await registerPost(post("/api/auth/register", INVALID_BODY, { origin: CROSS }));
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("CROSS_ORIGIN_BLOCKED");
  });

  it("注册:跨源 + text/plain → 仍 403(来源校验先于媒体类型闸)", async () => {
    const res = await registerPost(
      post("/api/auth/register", INVALID_BODY, { origin: CROSS, contentType: "text/plain" }),
    );
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("CROSS_ORIGIN_BLOCKED");
  });

  it("登录:跨源 → 403", async () => {
    const res = await loginPost(
      post("/api/auth/login", { username: "nobody", password: "whatever" }, { origin: CROSS }),
    );
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("CROSS_ORIGIN_BLOCKED");
  });

  it("账户资料:跨源 → 403", async () => {
    const req = new NextRequest("http://localhost/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname: "跨源改名" }),
      headers: {
        "content-type": "application/json",
        origin: CROSS,
        host: "localhost",
      },
    });
    const res = await profilePatch(req);
    expect(res.status).toBe(403);
    expect(await errCode(res)).toBe("CROSS_ORIGIN_BLOCKED");
  });
});

describe("媒体类型闸", () => {
  it("无 Origin + text/plain → 415", async () => {
    const res = await registerPost(
      post("/api/auth/register", INVALID_BODY, { contentType: "text/plain" }),
    );
    expect(res.status).toBe(415);
    expect(await errCode(res)).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("同源与非浏览器客户端放行", () => {
  it("同源 Origin → 过了来源闸(在参数校验处 422)", async () => {
    const res = await registerPost(
      post("/api/auth/register", INVALID_BODY, { origin: "http://localhost" }),
    );
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe("VALIDATION_ERROR");
  });

  it("无 Origin/Referer(脚本/测试客户端)→ 过了来源闸", async () => {
    const res = await registerPost(post("/api/auth/register", INVALID_BODY));
    expect(res.status).toBe(422);
    expect(await errCode(res)).toBe("VALIDATION_ERROR");
  });
});
