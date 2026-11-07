import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION } from "@/constants/session";
import { clearSessionCookies } from "@/lib/auth/cookies";
import { revokeRefreshToken, revokeSession } from "@/lib/auth/session";
import { getApiSession } from "@/server/session-guard";
import { checkSameOrigin } from "@/server/origin-guard";

/**
 * 主动退出(FR-201):吊销 Redis 会话 + 当前设备 refresh token,并清 Cookie。
 * 会话已过期时仍清 Cookie(幂等),不留残态。
 */
export async function POST(req: NextRequest) {
  const origin = await checkSameOrigin(req);
  if (!origin.ok) return origin.response;
  const session = await getApiSession(req);
  if (session) {
    await revokeSession(session.userId, session.jti);
    await revokeRefreshToken(
      session.userId,
      req.cookies.get(SESSION.REFRESH_COOKIE)?.value,
    );
  }

  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
