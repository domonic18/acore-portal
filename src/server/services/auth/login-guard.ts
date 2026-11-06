import "server-only";
import { getConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { checkLock, clearKeys, hitRateLimit, setLock } from "@/lib/redis/rate-limit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { loginFailIpKey, loginFailKey, loginLockKey } from "@/constants/security";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * 未知用户名失败审计的去重键(防写放大):
 * 同一 (用户名,IP) 在窗口内只落一行审计,失败计数不受影响。
 * 用户名取 sha256 前 16 位——Redis key 不留原始用户名,且键长有界。
 */
export const auditUnknownUserKey = (username: string, ip: string) =>
  `rl:audit:unknown:${sha256Hex(username.toLowerCase()).slice(0, 16)}:${ip}`;

export type LockCheck = { locked: true; retryAfterSec: number } | { locked: false };

/** 前置锁检查:锁期内不验 Turnstile、不碰凭据,调用方直接 429 */
export async function assertNotLocked(username: string): Promise<LockCheck> {
  const state = await checkLock(loginLockKey(username));
  return state.locked ? { locked: true, retryAfterSec: state.retryAfterSec } : { locked: false };
}

/**
 * 记一次凭据失败:用户名+IP 双维固定窗口计数(IP 维仅在有可信 XFF 时,
 * 防 frp 共享出口 IP 误锁他人)。越过阈值 → 显式锁+审计(LOGIN_LOCKED,
 * 只记用户名/ip/计数,无凭据字段,宪法 VI);当前次由调用方按 429 应答。
 * 计数按请求呈现的用户名统计(含不存在用户),防枚举探测。
 *
 * 计数走 failOpen:false——Redis 故障时抛 RateLimitUnavailableError,
 * 由路由回 503;绝不能「故障即放行」,那等于限流被静默绕过。
 */
export async function recordFailure(
  username: string,
  ip?: string | null,
): Promise<{ exceeded: boolean; retryAfterSec: number }> {
  const { security } = await getConfig();
  const userDim = await hitRateLimit(loginFailKey(username), {
    windowSec: security.loginWindowSec,
    max: security.loginMaxFails,
    failOpen: false,
  });
  const ipDim = ip
    ? await hitRateLimit(loginFailIpKey(ip), {
        windowSec: security.loginWindowSec,
        max: security.loginMaxFails,
        failOpen: false,
      })
    : null;
  const exceeded = !userDim.allowed || ipDim?.allowed === false;
  if (exceeded) {
    await setLock(loginLockKey(username), security.loginLockSec);
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_LOCKED,
      // ip 落顶层列(可按列检索),不进 payload
      ip: ip ?? null,
      payload: {
        username,
        ip: ip ?? null,
        fails: Math.max(userDim.count, ipDim?.count ?? 0),
      },
    });
    return { exceeded: true, retryAfterSec: security.loginLockSec };
  }
  return { exceeded: false, retryAfterSec: 0 };
}

/**
 * 登录成功清账:失败计数(用户名/IP)与锁全清。
 * 清账是尽力而为——Redis 故障时不能让已成功的登录反过来报 500,
 * 残留计数至多让用户下次失败时多等一个窗口。
 */
export async function clearOnSuccess(username: string, ip?: string | null): Promise<void> {
  const keys = [loginFailKey(username), loginLockKey(username)];
  if (ip) keys.push(loginFailIpKey(ip));
  try {
    await clearKeys(keys);
  } catch {
    // 忽略:清账失败不影响本次登录结果
  }
}
