import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION } from "@/constants/session";
import { ADMIN_SURFACE_HEADER, ADMIN_SURFACE_VALUE } from "@/constants/admin";
import { normalizeLegacyKey } from "@/constants/legacy-routes";
import { edgeEnv } from "@/lib/env-edge";
import { resolveSessionGate } from "@/lib/auth/session-gate";

/**
 * edge 兼容层(edge runtime,无 Prisma):
 * ① 旧 WP 登录类地址硬编码 302,不查表(FR-025);
 * ② 旧内容地址 ?p=/?page_id=?cat=(/?topic=/?forum=)规范化后 rewrite 到 Node 处理器查 route_map(FR-026);
 * ③ 旧 WooCommerce 账户地址 /my-account 301 到 /account(路径结构同构,子路径透传);
 * ④ 会话浅校验:access 有效 ⇒ 放行;access 失效但带 refresh ⇒ 307 去续期路由续期后回原路径;
 * ⑤ /admin/* 角色校验(吊销态由 RSC/API 深校验兜底);
 * ⑥ 旧论坛地址 /bbs 与 /bbs/* 路径级折叠 301 到 /forum,带 topic=/forum= 键时走 route_map(M3 FR-219)。
 */
export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (pathname === "/my-account" || pathname.startsWith("/my-account/")) {
    return NextResponse.redirect(
      new URL(pathname.replace(/^\/my-account/, "/account"), req.url),
      301,
    );
  }

  if (pathname === "/wp-login.php") {
    const action = searchParams.get("action");
    const dest =
      action === "register"
        ? "/register"
        : action === "lostpassword"
          ? "/forgot-password"
          : "/login";
    return NextResponse.redirect(new URL(dest, req.url), 302);
  }

  if (pathname === "/bbs" || pathname.startsWith("/bbs/")) {
    const key = normalizeLegacyKey(
      null,
      null,
      null,
      searchParams.get("topic"),
      searchParams.get("forum"),
    );
    if (key) {
      return NextResponse.rewrite(new URL(`/legacy-redirect/${key}`, req.url));
    }
    return NextResponse.redirect(new URL("/forum", req.url), 301);
  }

  if (pathname === "/" || pathname === "/index.php") {
    const key = normalizeLegacyKey(
      searchParams.get("p"),
      searchParams.get("page_id"),
      searchParams.get("cat"),
      searchParams.get("topic"),
      searchParams.get("forum"),
    );
    if (key) {
      // 键走路径段:Next 14 rewrite 会丢弃目标 URL 的查询参数(实测踩坑)
      return NextResponse.rewrite(new URL(`/legacy-redirect/${key}`, req.url));
    }
  }

  // ===== 会话门 =====
  const access = req.cookies.get(SESSION.ACCESS_COOKIE)?.value;
  let role: string | null = null;
  if (access) {
    try {
      const secret = new TextEncoder().encode(edgeEnv.SESSION_SECRET);
      const { payload } = await jwtVerify(access, secret);
      role = typeof payload.role === "string" ? payload.role : "user";
    } catch {
      // 签名/过期问题 ⇒ 视作无会话,走续期或登录引导
      role = null;
    }
  }

  const gate = resolveSessionGate({
    role,
    hasRefresh: Boolean(req.cookies.get(SESSION.REFRESH_COOKIE)?.value),
    method: req.method,
    pathname,
  });

  switch (gate.kind) {
    case "pass": {
      if (!gate.adminSurface) return NextResponse.next();
      // 后台是独立控制台:打标记让根布局省掉门户装饰大图(见 constants/admin.ts)
      const reqHeaders = new Headers(req.headers);
      reqHeaders.set(ADMIN_SURFACE_HEADER, ADMIN_SURFACE_VALUE);
      return NextResponse.next({ request: { headers: reqHeaders } });
    }
    case "refresh": {
      // 无有效 access 但带 refresh ⇒ 先续期(remember 登录的核心链路,307 回原路径)
      const target = new URL("/api/auth/refresh", req.url);
      target.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
      return NextResponse.redirect(target, 307);
    }
    case "login":
      return loginRedirect(req);
    case "anonymous":
      return NextResponse.next();
  }
}

function loginRedirect(req: NextRequest) {
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  /**
   * 页面路径全量纳入:续期必须覆盖公开页,否则页头登录态会随 access 过期而消失
   * (用户观感就是「第二天又被要求登录」)。
   * 排除 API(自管鉴权语义)、静态资源(图片被 307 续期跳转 ⇒ 翻倍请求)、
   * 认证页(续期失败会回这些页,再触发续期即死循环)。
   * .php 不在静态扩展名黑名单里:旧 WP 地址仍须过 middleware 做兼容跳转。
   */
  matcher: [
    "/((?!api/|_next/|uploads/|login|register|forgot-password|reset-password|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|mjs|json|txt|xml|woff2?|ttf|eot|map|webmanifest)$).*)",
  ],
};
