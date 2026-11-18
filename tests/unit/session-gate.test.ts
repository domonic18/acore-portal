import { describe, expect, it } from "vitest";
import { resolveSessionGate } from "@/lib/auth/session-gate";

/**
 * 会话门判定表(edge 侧纯函数):
 * ① access 有效 ⇒ 放行;后台路径另需 admin 角色;
 * ② access 失效但带 refresh 且是导航请求 ⇒ 续期;
 * ③ 其余 ⇒ 受保护路径去登录页,公开路径按未登录放行。
 */
describe("resolveSessionGate", () => {
  it("access 有效 ⇒ 放行(公开页不带 admin 标记)", () => {
    expect(
      resolveSessionGate({
        role: "user",
        hasRefresh: false,
        method: "GET",
        pathname: "/shop",
      }),
    ).toEqual({ kind: "pass", adminSurface: false });
  });

  it("access 有效且角色为 admin ⇒ 放行并标记后台控制台", () => {
    expect(
      resolveSessionGate({
        role: "admin",
        hasRefresh: false,
        method: "GET",
        pathname: "/admin/products/categories",
      }),
    ).toEqual({ kind: "pass", adminSurface: true });
  });

  it("非 admin 访问后台 ⇒ 去登录页(不续期,续期也救不了角色)", () => {
    expect(
      resolveSessionGate({
        role: "user",
        hasRefresh: true,
        method: "GET",
        pathname: "/admin/products/categories",
      }),
    ).toEqual({ kind: "login" });
  });

  it("access 失效但带 refresh + 导航请求 ⇒ 续期", () => {
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: true,
        method: "GET",
        pathname: "/account/overview",
      }),
    ).toEqual({ kind: "refresh" });
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: true,
        method: "HEAD",
        pathname: "/shop",
      }),
    ).toEqual({ kind: "refresh" });
  });

  it("非导航请求不触发续期(POST 重定向会被 fetch 跟成重放)", () => {
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: true,
        method: "POST",
        pathname: "/account/overview",
      }),
    ).toEqual({ kind: "login" });
  });

  it("受保护路径无 refresh ⇒ 去登录页", () => {
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: false,
        method: "GET",
        pathname: "/account/overview",
      }),
    ).toEqual({ kind: "login" });
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: false,
        method: "GET",
        pathname: "/admin",
      }),
    ).toEqual({ kind: "login" });
  });

  it("公开路径无会话 ⇒ 按未登录放行", () => {
    expect(
      resolveSessionGate({
        role: null,
        hasRefresh: false,
        method: "GET",
        pathname: "/shop",
      }),
    ).toEqual({ kind: "anonymous" });
  });
});
