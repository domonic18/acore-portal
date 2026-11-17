import { isAdminPath, isProtectedPath } from "@/constants/session";

/**
 * 会话门判定(edge 侧纯函数,便于单测;middleware 只做 IO):
 * ① access 有效 ⇒ 放行(后台路径另需 admin 角色,不足则去登录页);
 * ② access 失效但带 refresh 且是导航请求 ⇒ 先续期(307 回原路径);
 * ③ 其余 ⇒ 受保护路径去登录页,公开路径按未登录放行。
 *
 * 续期只对导航请求(GET/HEAD)发起:POST 重定向到续期路由会被 fetch
 * 跟成对原路径的重放 POST,语义不成立。
 */
export type SessionGate =
  | { kind: "pass"; adminSurface: boolean }
  | { kind: "refresh" }
  | { kind: "login" }
  | { kind: "anonymous" };

export function resolveSessionGate(input: {
  /** access 有效时的角色;null = 无有效 access(缺失/过期/签名错) */
  role: string | null;
  hasRefresh: boolean;
  method: string;
  pathname: string;
}): SessionGate {
  const adminSurface = isAdminPath(input.pathname);
  if (input.role) {
    if (adminSurface && input.role !== "admin") return { kind: "login" };
    return { kind: "pass", adminSurface };
  }
  const navigable = input.method === "GET" || input.method === "HEAD";
  if (input.hasRefresh && navigable) return { kind: "refresh" };
  if (isProtectedPath(input.pathname)) return { kind: "login" };
  return { kind: "anonymous" };
}
