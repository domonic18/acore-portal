import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION } from "@/constants/session";

/**
 * 路由守卫(edge runtime,无 redis):仅做 JWT 浅校验(jti 吊销态由 RSC/API 深校验)。
 * /account/* 需任意有效会话;/admin/* 需 admin 角色;未登录 → /login?next=
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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

export const config = {
  matcher: ["/account/:path*", "/admin/:path*"],
};
