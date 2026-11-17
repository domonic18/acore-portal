import { describe, expect, it } from "vitest";
import { splitSiteUrl, decodeUrlForDisplay } from "@/lib/url-path";

/**
 * 站点 URL 展示辅助(看板蜘蛛 URL/页面路径的可读性):
 * 完整 URL 拆出域名前缀灰显 + 路径主显;百分号编码尝试解码展示,坏编码回落原文。
 */

describe("splitSiteUrl 拆域名前缀", () => {
  it("完整 URL 拆出 origin + path", () => {
    expect(splitSiteUrl("https://lokta.cn/banlist/")).toEqual({
      origin: "https://lokta.cn",
      path: "/banlist/",
    });
  });

  it("http 协议同样拆分;仅域名无路径时 path 为 /", () => {
    expect(splitSiteUrl("http://lokta.cn")).toEqual({ origin: "http://lokta.cn", path: "/" });
    expect(splitSiteUrl("http://lokta.cn/")).toEqual({ origin: "http://lokta.cn", path: "/" });
  });

  it("带查询串的 URL 保留查询串", () => {
    expect(splitSiteUrl("https://lokta.cn/?p=2437")).toEqual({
      origin: "https://lokta.cn",
      path: "/?p=2437",
    });
  });

  it("站内相对路径原样返回(origin 为空串)", () => {
    expect(splitSiteUrl("/news/abc")).toEqual({ origin: "", path: "/news/abc" });
    expect(splitSiteUrl("/")).toEqual({ origin: "", path: "/" });
  });

  it("非 http(s) 形态不拆(整串当路径)", () => {
    expect(splitSiteUrl("ftp://x/y")).toEqual({ origin: "", path: "ftp://x/y" });
    expect(splitSiteUrl("//evil.com/a")).toEqual({ origin: "", path: "//evil.com/a" });
  });
});

describe("decodeUrlForDisplay 展示解码", () => {
  it("含百分号编码时解码为可读中文", () => {
    expect(decodeUrlForDisplay("/%E6%94%BB%E7%95%A5")).toBe("/攻略");
  });

  it("不含百分号编码原样返回", () => {
    expect(decodeUrlForDisplay("/post/hello-world")).toBe("/post/hello-world");
  });

  it("坏编码回落原文不抛错", () => {
    expect(decodeUrlForDisplay("/%E6%94%BB")).toBe("/攻");
    expect(decodeUrlForDisplay("/%zz")).toBe("/%zz");
    expect(decodeUrlForDisplay("/a%")).toBe("/a%");
  });
});
