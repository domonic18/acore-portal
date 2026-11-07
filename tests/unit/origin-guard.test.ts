import { describe, expect, it } from "vitest";
import {
  collectAllowedOrigins,
  isSameOriginRequest,
  normalizeOrigin,
} from "@/server/origin-guard";

/**
 * 写请求来源校验(CSRF 第一道闸):
 * 浏览器跨源写请求必带 Origin → 必须同源;非浏览器客户端(Origin/Referer 都缺)放行。
 */

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("normalizeOrigin", () => {
  it("取 http/https 绝对来源的 origin", () => {
    expect(normalizeOrigin("https://lokta.cn/login?a=1")).toBe("https://lokta.cn");
    expect(normalizeOrigin("http://localhost:9000")).toBe("http://localhost:9000");
  });

  it("相对路径、null、非 http(s) 一律无效", () => {
    expect(normalizeOrigin("/api/auth/login")).toBeNull();
    expect(normalizeOrigin("null")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin(null)).toBeNull();
  });
});

describe("collectAllowedOrigins", () => {
  it("含 Host 的 http/https 两种协议 + 后台配置的站点地址", () => {
    const allowed = collectAllowedOrigins(
      headers({ host: "dev.17aitech.com" }),
      "https://lokta.cn",
    );
    expect(allowed).toContain("http://dev.17aitech.com");
    expect(allowed).toContain("https://dev.17aitech.com");
    expect(allowed).toContain("https://lokta.cn");
  });

  it("Host 缺失时只剩配置地址", () => {
    const allowed = collectAllowedOrigins(headers({}), "https://lokta.cn");
    expect(allowed).toEqual(["https://lokta.cn"]);
  });

  it("配置地址非法时只留 Host", () => {
    const allowed = collectAllowedOrigins(headers({ host: "a.test" }), "not-a-url");
    expect(allowed).toEqual(["http://a.test", "https://a.test"]);
  });
});

describe("isSameOriginRequest", () => {
  it("Origin 与 Referer 都缺失 → 放行(非浏览器客户端)", () => {
    expect(isSameOriginRequest(headers({ host: "localhost:3000" }), null)).toBe(true);
  });

  it("Origin 与 Host 同源 → 放行", () => {
    const h = headers({ host: "localhost:3000", origin: "http://localhost:3000" });
    expect(isSameOriginRequest(h, null)).toBe(true);
  });

  it("Origin 与后台配置地址同源 → 放行(反代改写 Host 的场景)", () => {
    const h = headers({ host: "127.0.0.1:9000", origin: "https://dev.17aitech.com" });
    expect(isSameOriginRequest(h, "https://dev.17aitech.com")).toBe(true);
  });

  it("跨源 Origin → 拒绝", () => {
    const h = headers({ host: "lokta.cn", origin: "https://evil.example" });
    expect(isSameOriginRequest(h, "https://lokta.cn")).toBe(false);
  });

  it("Origin 非法但 Referer 同源 → 放行", () => {
    const h = headers({
      host: "lokta.cn",
      origin: "null",
      referer: "https://lokta.cn/login",
    });
    expect(isSameOriginRequest(h, "https://lokta.cn")).toBe(true);
  });

  it("Origin 跨源但 Referer 同源 → 拒绝(以 Origin 为准)", () => {
    const h = headers({
      host: "lokta.cn",
      origin: "https://evil.example",
      referer: "https://lokta.cn/login",
    });
    expect(isSameOriginRequest(h, "https://lokta.cn")).toBe(false);
  });

  it("跨源 Referer(无 Origin)→ 拒绝", () => {
    const h = headers({ host: "lokta.cn", referer: "https://evil.example/x" });
    expect(isSameOriginRequest(h, "https://lokta.cn")).toBe(false);
  });
});
