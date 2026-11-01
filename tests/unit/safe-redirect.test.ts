import { describe, expect, it } from "vitest";
import { DEFAULT_LOGIN_NEXT, safeNextPath } from "@/lib/safe-redirect";

/** 登录回跳只允许站内相对路径,防止 ?next= 变成开放重定向 */
describe("lib/safe-redirect 回跳白名单", () => {
  it("保留站内相对路径与查询串", () => {
    expect(safeNextPath("/cart")).toBe("/cart");
    expect(safeNextPath("/shop/mount?tab=detail")).toBe("/shop/mount?tab=detail");
    expect(safeNextPath("/account/orders#top")).toBe("/account/orders#top");
  });

  it("缺省或非法输入回落到默认落点", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("")).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("cart")).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("javascript:alert(1)")).toBe(DEFAULT_LOGIN_NEXT);
  });

  it("拒绝协议相对与外链", () => {
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("/\t/evil.com")).toBe(DEFAULT_LOGIN_NEXT);
    expect(safeNextPath("https://evil.com/cart")).toBe(DEFAULT_LOGIN_NEXT);
  });
});
