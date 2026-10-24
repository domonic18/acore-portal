import "server-only";
import type { NextResponse } from "next/server";
import { SESSION } from "@/constants/session";

/**
 * 会话 Cookie 写入(research R4):
 * HttpOnly + SameSite=Lax + Path=/;Secure 仅生产(NODE_ENV=production)。
 */
export function setSessionCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken?: string },
): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(SESSION.ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION.ACCESS_TTL_SECONDS,
  });
  if (tokens.refreshToken) {
    res.cookies.set(SESSION.REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: SESSION.REFRESH_TTL_SECONDS,
    });
  }
}

export function clearSessionCookies(res: NextResponse): void {
  for (const name of [SESSION.ACCESS_COOKIE, SESSION.REFRESH_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
}
