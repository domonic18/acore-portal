import "server-only";
import { getConfig } from "@/lib/config";
import {
  checkLock,
  clearKeys,
  hitRateLimit,
  setLock,
} from "@/lib/redis/rate-limit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/** 键格式统一定义(M4 防滥用设计;调用方不感知,测试可按此格式注入状态) */
export const loginFailKey = (username: string) =>
  `rl:login:fail:u:${username.toLowerCase()}`;
export const loginFailIpKey = (ip: string) => `rl:login:fail:ip:${ip}`;
export const loginLockKey = (username: string) =>
  `login:lock:u:${username.toLowerCase()}`;

export type LockCheck = { locked: true; retryAfterSec: number } | { locked: false };

/** 前置锁检查:锁期内不验 Turnstile、不碰凭据,调用方直接 429 */
export async function assertNotLocked(username: string): Promise<LockCheck> {
  const state = await checkLock(loginLockKey(username));
  return state.locked
    ? { locked: true, retryAfterSec: state.retryAfterSec }
    : { locked: false };
}

/**
 * 记一次凭据失败:用户名+IP 双维固定窗口计数(IP 维仅在有可信 XFF 时,
 * 防 frp 共享出口 IP 误锁他人)。越过阈值 → 显式锁+审计(LOGIN_LOCKED,
 * 只记用户名/ip/计数,无凭据字段,宪法 VI);当前次由调用方按 429 应答。
 * 计数按请求呈现的用户名统计(含不存在用户),防枚举探测。
 */
export async function recordFailure(
  username: string,
  ip?: string | null,
): Promise<{ exceeded: boolean; retryAfterSec: number }> {
  const { security } = await getConfig();
  const userDim = await hitRateLimit(loginFailKey(username), {
    windowSec: security.loginWindowSec,
    max: security.loginMaxFails,
  });
  const ipDim = ip
    ? await hitRateLimit(loginFailIpKey(ip), {
        windowSec: security.loginWindowSec,
        max: security.loginMaxFails,
      })
    : null;
  const exceeded = !userDim.allowed || (ipDim?.allowed === false);
  if (exceeded) {
    await setLock(loginLockKey(username), security.loginLockSec);
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_LOCKED,
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

/** 登录成功清账:失败计数(用户名/IP)与锁全清 */
export async function clearOnSuccess(
  username: string,
  ip?: string | null,
): Promise<void> {
  const keys = [loginFailKey(username), loginLockKey(username)];
  if (ip) keys.push(loginFailIpKey(ip));
  await clearKeys(keys);
}
