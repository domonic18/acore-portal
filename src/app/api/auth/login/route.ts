import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { createSession, issueRefreshToken } from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { loginWithPassword } from "@/server/services/auth/login";

const loginSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional().default(false),
});

/** 统一 401 模糊文案(不泄露账号存在性与失败细节,FR-013);附找回引导 */
const UNIFIED_401 = "用户名或密码错误。若遗忘密码,请走找回密码流程。";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { username, password, remember } = parsed.data;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");

  // 429 限速语义 M4 实装(Turnstile+限速为公网暴露前硬性要求,宪法 VI deferral)

  const outcome = await loginWithPassword(username, password, { ip });
  if (!outcome.ok) {
    // 真实原因仅审计可见(login 服务已写);对外一律统一文案
    return apiError(401, "INVALID_CREDENTIALS", UNIFIED_401);
  }

  const { accessToken } = await createSession(outcome.user.id, outcome.user.role);
  const refreshToken = remember
    ? (await issueRefreshToken(outcome.user.id)).token
    : undefined;

  const res = NextResponse.json({
    user: { username: outcome.user.username, role: outcome.user.role },
    upgraded: outcome.upgraded,
  });
  setSessionCookies(res, { accessToken, refreshToken });
  return res;
}
