import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { createSession, issueRefreshToken } from "@/lib/auth/session";
import { setSessionCookies } from "@/lib/auth/cookies";
import { loginWithPassword } from "@/server/services/auth/login";
import {
  assertIpNotLocked,
  assertNotLocked,
  clearOnSuccess,
  recordFailure,
  waitForIpSoftLock,
} from "@/server/services/auth/login-guard";
import { acquireHashSlot } from "@/server/services/auth/hash-semaphore";
import { writeAudit } from "@/server/services/shared/audit";
import { RateLimitUnavailableError, hitRateLimit, readRateLimit } from "@/lib/redis/rate-limit";
import { getConfig } from "@/lib/config";
import { UNKNOWN_CLIENT_IP } from "@/lib/net/client-ip";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { loginGlobalKey, LOGIN_GLOBAL_WINDOW_SEC } from "@/constants/security";
import { TURNSTILE_ERROR } from "@/constants/turnstile";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/server/services/shared/client-ip";

const loginSchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(256),
  remember: z.boolean().optional().default(false),
  turnstileToken: z.string().max(2048).optional().default(""),
});

/** 统一 401 模糊文案(不泄露账号存在性与失败细节,FR-013);附找回引导 */
const UNIFIED_401 = "用户名或密码错误。若遗忘密码,请走找回密码流程。";
/** 两类 429 对外同一文案(不泄露触发原因),code 区分 RATE_LIMITED/LOGIN_LOCKED/SERVER_BUSY */
const RATE_LIMIT_429 = "尝试过于频繁,请稍后再试。";
/** 服务繁忙(并发闸排队超时/全局哈希预算耗尽)——与限流文案区分,便于运维定位 */
const SERVER_BUSY_429 = "登录服务繁忙,请稍后再试。";

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.response;
  const { username, password, remember, turnstileToken } = parsed.data;
  const ip = await getClientIp(req);

  try {
    const { security } = await getConfig();

    // ① IP 锁前置:攻击源 IP 被锁 → 该 IP 全部登录拒(只锁 IP,不牵连账号)
    const ipLock = await assertIpNotLocked(ip ?? UNKNOWN_CLIENT_IP);
    if (ipLock.locked) {
      return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
        retryAfterSec: ipLock.retryAfterSec,
      });
    }

    // ② 账号锁前置:锁期内不验 Turnstile/凭据,直接 429
    const lock = await assertNotLocked(username);
    if (lock.locked) {
      return apiError(429, "LOGIN_LOCKED", RATE_LIMIT_429, {
        retryAfterSec: lock.retryAfterSec,
      });
    }

    // ③ IP 软锁等待:越软阈的 IP 短暂串行化(降速不拒绝)
    if (ip) await waitForIpSoftLock(ip);

    // ④ 全局哈希预算前瞻(只读计数):额度耗尽直接 429,免去后续开销。
    // 计数在真正跑哈希前才自增——否则被 Turnstile 拦下的请求也吃预算,
    // 攻击者可用无效 token 瞬间烧穿预算,把正常用户挤成 429。
    const budget = await readRateLimit(loginGlobalKey());
    if (budget.count >= security.loginGlobalMaxPerMin) {
      return apiError(429, "SERVER_BUSY", SERVER_BUSY_429, {
        retryAfterSec: budget.retryAfterSec,
      });
    }

    // ⑤ Turnstile siteverify:失败 422,不计失败次数
    const turnstile = await verifyTurnstile(turnstileToken, ip ?? undefined);
    if (!turnstile.ok) {
      if (turnstile.errors?.includes("not-configured")) {
        // 运维误配(已启用但密钥缺失):失败关闭,站点其余部分不受影响
        return apiError(422, TURNSTILE_ERROR.UNAVAILABLE.code, TURNSTILE_ERROR.UNAVAILABLE.message);
      }
      return apiError(422, TURNSTILE_ERROR.FAILED.code, TURNSTILE_ERROR.FAILED.message);
    }

    // ⑥ 取哈希槽:单进程并发闸,排队上限 loginQueueWaitMs,取不到 → 429 SERVER_BUSY。
    // 排在 Turnstile 之后——人机校验失败的请求不占槽(否则会被无效 token 的洪水占满)。
    const slot = await acquireHashSlot(security.loginMaxConcurrent, security.loginQueueWaitMs);
    if (!slot.ok) {
      return apiError(429, "SERVER_BUSY", SERVER_BUSY_429, { retryAfterSec: 1 });
    }

    // ⑧ 凭据校验(全站唯一跑哈希处)——槽位只覆盖哈希本身,
    // 计数/审计/建会话等 IO 不占着 CPU 槽(否则吞吐被 Redis 往返拖住)。
    let outcome: Awaited<ReturnType<typeof loginWithPassword>>;
    try {
      // ⑦ 消费哈希预算(此刻才算一次真实哈希)
      const consumed = await hitRateLimit(loginGlobalKey(), {
        windowSec: LOGIN_GLOBAL_WINDOW_SEC,
        max: security.loginGlobalMaxPerMin,
        failOpen: false,
      });
      if (!consumed.allowed) {
        return apiError(429, "SERVER_BUSY", SERVER_BUSY_429, {
          retryAfterSec: consumed.retryAfterSec,
        });
      }
      outcome = await loginWithPassword(username, password, { ip });
    } finally {
      slot.slot.release();
    }

    if (!outcome.ok) {
      // ⑨ 失败计数:用户名维与 IP 维解耦——IP 维越阈只锁攻击源 IP
      const gate = await recordFailure(username, ip);
      if (gate.ipLocked || gate.accountLocked) {
        return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
          retryAfterSec: gate.retryAfterSec,
        });
      }
      // 真实原因仅审计可见(login 服务已写);对外一律统一模糊文案
      return apiError(401, "INVALID_CREDENTIALS", UNIFIED_401);
    }

    // ⑩ 成功清账(用户名维计数与锁全清;IP 维计数保留,理由见 login-guard)
    await clearOnSuccess(username);

    // ⑪ 成功审计(2026-11-06 撞库加固):凭据有效即记,用于界定被攻陷账号
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_SUCCESS,
      actorUserId: outcome.user.id,
      payload: { username: outcome.user.username, upgraded: outcome.upgraded },
      ip,
    });

    const { accessToken } = await createSession(outcome.user.id, outcome.user.role);
    const refreshToken = remember ? (await issueRefreshToken(outcome.user.id)).token : undefined;

    const res = NextResponse.json({
      user: { username: outcome.user.username, role: outcome.user.role },
      upgraded: outcome.upgraded,
    });
    setSessionCookies(res, { accessToken, refreshToken });
    return res;
  } catch (err) {
    // Redis 故障:锁/计数不可用 → 失败关闭(503),既不静默放行也不 500
    if (err instanceof RateLimitUnavailableError) {
      return apiError(503, "AUTH_UNAVAILABLE", "登录服务暂时不可用,请稍后再试。");
    }
    throw err;
  }
}
