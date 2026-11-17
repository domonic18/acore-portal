import { describe, expect, it } from "vitest";
import {
  normalizePagePath,
  visitorIdFromIp,
  onlineVisitorKeySuffix,
  encodeOnlineVisitor,
  decodeOnlineVisitor,
} from "@/server/services/stats/page-view";
import { PAGE_VIEW_PATH_MAX } from "@/constants/page-view";

/**
 * 页面访问采集纯函数(替代 umami 的自建统计):
 * 访客标识 IP+日盐哈希(同日同 IP 同值/跨日重新计数/不留原始 IP);
 * 路径规范化:站内相对路径、去查询串、截断、排除后台路径;
 * 在线滑窗键(2026-11-17):登录按账号去重、游客按 IP 去重、JSON 载荷往返无损。
 */

describe("visitorIdFromIp 访客标识", () => {
  const day = new Date("2026-11-06T10:00:00Z");

  it("同 IP 同日 → 同一 64 位 hex 哈希", () => {
    const a = visitorIdFromIp("1.2.3.4", day);
    const b = visitorIdFromIp("1.2.3.4", day);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("哈希不含原始 IP", () => {
    expect(visitorIdFromIp("1.2.3.4", day)).not.toContain("1.2.3.4");
  });

  it("换 IP → 不同访客;换日 → 同一 IP 也重新计数", () => {
    expect(visitorIdFromIp("1.2.3.5", day)).not.toBe(visitorIdFromIp("1.2.3.4", day));
    const nextDay = new Date("2026-11-07T10:00:00Z");
    expect(visitorIdFromIp("1.2.3.4", nextDay)).not.toBe(visitorIdFromIp("1.2.3.4", day));
  });

  it("无 IP → 退化为固定匿名标识(仍按日分桶)", () => {
    expect(visitorIdFromIp(null, day)).toBe(visitorIdFromIp(null, day));
    expect(visitorIdFromIp(null, day)).not.toBe(visitorIdFromIp(null, new Date("2026-11-07T10:00:00Z")));
  });
});

describe("normalizePagePath 路径规范化", () => {
  it("合法站内路径原样保留", () => {
    expect(normalizePagePath("/news/123")).toBe("/news/123");
  });

  it("去查询串与锚点", () => {
    expect(normalizePagePath("/news?a=1")).toBe("/news");
    expect(normalizePagePath("/news#top")).toBe("/news");
  });

  it("超长路径截断至 256", () => {
    const raw = `/${"a".repeat(400)}`;
    expect(normalizePagePath(raw)).toHaveLength(PAGE_VIEW_PATH_MAX);
  });

  it("非法路径返回 null:外域/协议相对/非斜杠/含换行", () => {
    expect(normalizePagePath("https://evil.com/a")).toBeNull();
    expect(normalizePagePath("//evil.com/a")).toBeNull();
    expect(normalizePagePath("no-slash")).toBeNull();
    expect(normalizePagePath("/line\nbreak")).toBeNull();
  });

  it("后台路径排除(/admin、/wp-admin 含子路径)", () => {
    expect(normalizePagePath("/admin")).toBeNull();
    expect(normalizePagePath("/admin/stats")).toBeNull();
    expect(normalizePagePath("/wp-admin")).toBeNull();
    expect(normalizePagePath("/administrator")).toBe("/administrator");
  });
});

describe("onlineVisitorKeySuffix 在线键去重口径", () => {
  it("登录访客按 userId:同一账号换 IP/多端仍是同一个键", () => {
    const uid = 42n;
    expect(onlineVisitorKeySuffix({ path: "/forum", ip: "1.1.1.1", userId: uid })).toBe("u:42");
    expect(onlineVisitorKeySuffix({ path: "/shop", ip: "2.2.2.2", userId: uid })).toBe("u:42");
  });

  it("游客按 IP 去重;无 IP 并入共享 unknown 键", () => {
    expect(onlineVisitorKeySuffix({ path: "/news", ip: "3.3.3.3", userId: null })).toBe("g:3.3.3.3");
    expect(onlineVisitorKeySuffix({ path: "/news", ip: null, userId: null })).toBe("g:unknown");
  });
});

describe("在线访客 JSON 载荷编码/解码", () => {
  it("往返无损:BigInt userId 序列化为字符串", () => {
    const encoded = encodeOnlineVisitor({ path: "/post/abc", ip: "1.2.3.4", userId: 7n }, 1234);
    expect(decodeOnlineVisitor(encoded)).toEqual({
      path: "/post/abc",
      ip: "1.2.3.4",
      userId: "7",
      ts: 1234,
    });
  });

  it("游客载荷:ip/userId 均为 null 仍可解码", () => {
    const encoded = encodeOnlineVisitor({ path: "/", ip: null, userId: null }, 5);
    expect(decodeOnlineVisitor(encoded)).toEqual({
      path: "/",
      ip: null,
      userId: null,
      ts: 5,
    });
  });

  it("坏载荷回落 null:非 JSON/缺 path/缺 ts/ip 非字符串归 null", () => {
    expect(decodeOnlineVisitor("not-json")).toBeNull();
    expect(decodeOnlineVisitor(JSON.stringify({ ts: 1 }))).toBeNull();
    expect(decodeOnlineVisitor(JSON.stringify({ path: "/a" }))).toBeNull();
    expect(decodeOnlineVisitor(JSON.stringify({ path: "/a", ts: 1, ip: 9 }))).toEqual({
      path: "/a",
      ip: null,
      userId: null,
      ts: 1,
    });
  });
});
