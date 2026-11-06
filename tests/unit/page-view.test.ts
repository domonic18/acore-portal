import { describe, expect, it } from "vitest";
import {
  normalizePagePath,
  visitorIdFromIp,
} from "@/server/services/stats/page-view";
import { PAGE_VIEW_PATH_MAX } from "@/constants/page-view";

/**
 * 页面访问采集纯函数(替代 umami 的自建统计):
 * 访客标识 IP+日盐哈希(同日同 IP 同值/跨日重新计数/不留原始 IP);
 * 路径规范化:站内相对路径、去查询串、截断、排除后台路径。
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
