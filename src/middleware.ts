import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION } from "@/constants/session";
import { normalizeLegacyKey } from "@/constants/legacy-routes";

/**
 * edge 兼容层(edge runtime,无 Prisma):
 * ① 旧 WP 登录类地址硬编码 302,不查表(FR-025);
 * ② 旧内容地址 ?p=/?page_id=/?cat= 规范化后 rewrite 到 Node 处理器查 route_map(FR-026);
 * ③ 旧 WooCommerce 账户地址 /my-account 301 到 /account(路径结构同构,子路径透传,FR-109);
 * ④ /account/* 会话浅校验、/admin/* 角色校验(吊销态由 RSC/API 深校验兜底)。
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

  if (pathname === "/" || pathname === "/index.php") {
    const key = normalizeLegacyKey(
      searchParams.get("p"),
      searchParams.get("page_id"),
      searchParams.get("cat"),
    );
    if (key) {
      // 键走路径段:Next 14 rewrite 会丢弃目标 URL 的查询参数(实测踩坑)
      return NextResponse.rewrite(new URL(`/legacy-redirect/${key}`, req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/account") || pathname.startsWith("/admin")) {
    const token = req.cookies.get(SESSION.ACCESS_COOKIE)?.value;
    if (token) {
      try {
        const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
        const { payload } = await jwtVerify(token, secret);
        if (pathname.startsWith("/account")) return NextResponse.next();
        if (pathname.startsWith("/admin") && payload.role === "admin") {
          return NextResponse.next();
        }
      } catch {
        // 签名/过期问题 → 走登录引导
      }
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/index.php",
    "/wp-login.php",
    "/my-account/:path*",
    "/account/:path*",
    "/admin/:path*",
  ],
};
