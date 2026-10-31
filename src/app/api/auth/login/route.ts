import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { createSession, issueRefreshToken } from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { loginWithPassword } from "@/server/services/auth/login";
import {
  assertNotLocked,
  clearOnSuccess,
  recordFailure,
} from "@/server/services/auth/login-guard";
import { verifyTurnstile } from "@/lib/turnstile";

const loginSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional().default(false),
  turnstileToken: z.string().max(2048).optional().default(""),
});

/** 统一 401 模糊文案(不泄露账号存在性与失败细节,FR-013);附找回引导 */
const UNIFIED_401 = "用户名或密码错误。若遗忘密码,请走找回密码流程。";
/** 两类 429 对外同一文案(不泄露触发原因),code 区分 RATE_LIMITED/LOGIN_LOCKED */
const RATE_LIMIT_429 = "尝试过于频繁,请稍后再试。";
const TURNSTILE_422 = "人机验证未通过,请重试。";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { username, password, remember, turnstileToken } = parsed.data;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");

  // ① 前置锁检查:锁期内不验 Turnstile/凭据,直接 429
  const lock = await assertNotLocked(username);
  if (lock.locked) {
    return apiError(429, "LOGIN_LOCKED", RATE_LIMIT_429, {
      retryAfterSec: lock.retryAfterSec,
    });
  }

  // ② Turnstile siteverify:失败 422,不计失败次数
  const turnstile = await verifyTurnstile(turnstileToken, ip ?? undefined);
  if (!turnstile.ok) {
    return apiError(422, "TURNSTILE_FAILED", TURNSTILE_422);
  }

  const outcome = await loginWithPassword(username, password, { ip });
  if (!outcome.ok) {
    // ③ 失败计数:越过阈值 → 显式锁+审计(LOGIN_LOCKED),本次即 429
    const gate = await recordFailure(username, ip);
    if (gate.exceeded) {
      return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
        retryAfterSec: gate.retryAfterSec,
      });
    }
    // 真实原因仅审计可见(login 服务已写);对外一律统一模糊文案
    return apiError(401, "INVALID_CREDENTIALS", UNIFIED_401);
  }

  // ④ 成功清账(失败计数与锁全清)
  await clearOnSuccess(username, ip);

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
