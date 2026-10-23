import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { prisma } from "@/lib/db";
import {
  consumeRefreshToken,
  createSession,
} from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { SESSION } from "@/constants/session";

/**
 * remember 登录续期(research R4):access 过期后 middleware 重定向至此;
 * refresh 单次有效,使用即轮换;重放 → 全吊销。
 * GET(导航跳转,302 回原路径)与 POST(前端 fetch)双形态。
 * 角色以业务库为准回查(access JWT 可能已过期不可信)。
 */
async function handle(req: NextRequest) {
  const presented = req.cookies.get(SESSION.REFRESH_COOKIE)?.value;
  if (!presented) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 定位用户:从 access cookie 取 sub。仅作索引用:不验签(jose 5.10 已移除
  // ignoreExpiration,且此处本就无需信任其内容),真实性由 refresh 指纹校验兜底
  let userIdRaw: string | null = null;
  const access = req.cookies.get(SESSION.ACCESS_COOKIE)?.value;
  if (access) {
    try {
      userIdRaw = decodeJwt(access).sub ?? null;
    } catch {
      userIdRaw = null;
    }
  }
  if (!userIdRaw) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: BigInt(userIdRaw) },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.status === "banned") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const rotated = await consumeRefreshToken(user.id, presented);
  if (!rotated) {
    // 重放/过期:consumeRefreshToken 已全吊销
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set(SESSION.REFRESH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }

  const { accessToken } = await createSession(user.id, user.role);
  const res =
    req.method === "GET"
      ? NextResponse.redirect(
          new URL(req.nextUrl.searchParams.get("next") ?? "/account/overview", req.url),
        )
      : NextResponse.json({ ok: true });
  setSessionCookies(res, { accessToken, refreshToken: rotated.token });
  return res;
}

export { handle as GET, handle as POST };
