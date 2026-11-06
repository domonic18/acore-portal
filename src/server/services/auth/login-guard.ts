import "server-only";
import { getConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { UNKNOWN_CLIENT_IP } from "@/lib/net/client-ip";
import { checkLock, clearKeys, hitRateLimit, setLock } from "@/lib/redis/rate-limit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  loginFailIpKey,
  loginFailKey,
  loginIpLockKey,
  loginLockKey,
  loginSoftLockKey,
  LOGIN_UNKNOWN_IP_WINDOW_SEC,
} from "@/constants/security";
import { writeAudit } from "@/server/services/shared/audit";
import { writeAuditOnce } from "@/server/services/shared/audit-dedup";

/**
 * 未知用户名失败审计的去重键(防写放大):
 * 同一 (用户名,IP) 在窗口内只落一行审计,失败计数不受影响。
 * 用户名取 sha256 前 16 位——Redis key 不留原始用户名,且键长有界。
 */
export const auditUnknownUserKey = (username: string, ip: string) =>
  `rl:audit:unknown:${sha256Hex(username.toLowerCase()).slice(0, 16)}:${ip}`;

/**
 * IP 可疑审计的去重键(防写放大):
 * 同一 IP 在窗口内只落一行 LOGIN_IP_SUSPICIOUS,失败计数照常推进。
 */
export const auditIpSuspiciousKey = (ip: string) => `rl:audit:ipsusp:${ip}`;

export type LockCheck = { locked: true; retryAfterSec: number } | { locked: false };

/** 账号锁前置检查:锁期内不验 Turnstile、不碰凭据,调用方直接 429 */
export async function assertNotLocked(username: string): Promise<LockCheck> {
  const state = await checkLock(loginLockKey(username));
  return state.locked ? { locked: true, retryAfterSec: state.retryAfterSec } : { locked: false };
}

/**
 * IP 锁前置检查(2026-11-06 撞库加固 PR-C):
 * 攻击源 IP 被锁后,该 IP 的全部登录一律拒绝——**只锁 IP,不牵连任何账号**。
 * 这正是旧实现的最大问题:IP 计数越阈时锁的是被攻击的用户名,
 * 攻击者一次请求就能锁一个受害账号(批量锁号武器)。
 */
export async function assertIpNotLocked(ip: string): Promise<LockCheck> {
  const state = await checkLock(loginIpLockKey(ip));
  return state.locked ? { locked: true, retryAfterSec: state.retryAfterSec } : { locked: false };
}

/**
 * IP 软锁等待(降速不拒绝):
 * IP 失败数越软阈后,每次失败都把软锁续到 loginSoftLockSec,
 * 该 IP 的后续登录等软锁自然过期才继续——单 IP 速率被压到约 1 次/2 秒,
 * 机器人农场被降速约 30 倍,而正常用户的偶发手误不受影响。
 * 返回实际等待毫秒数(0 = 未被软锁)。
 */
export async function waitForIpSoftLock(ip: string): Promise<number> {
  const state = await checkLock(loginSoftLockKey(ip));
  if (!state.locked) return 0;
  const waitMs = state.retryAfterSec * 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return waitMs;
}

export type FailureGate = {
  /** 用户名维越阈:本次已锁该账号 */
  accountLocked: boolean;
  /** IP 维越阈:本次已锁该攻击源 IP(账号不受牵连) */
  ipLocked: boolean;
  /** 建议的重试等待秒数(未锁定时为 0) */
  retryAfterSec: number;
};

/**
 * 记一次凭据失败,用户名与 IP 双维**解耦**:
 * - 用户名维越阈 → 锁该账号(与既有口径一致);
 * - IP 维越阈 → 只锁该 IP,绝不锁账号(2026-11-06 撞库加固的正解);
 * - IP 维越软阈 → 落 LOGIN_IP_SUSPICIOUS 审计 + 续软锁(串行化降速,不拒绝)。
 *
 * IP 维计入**全部**失败(含不存在用户)——否则攻击者可用任意用户名枚举却不推进
 * IP 计数,等于给枚举发免死金牌。
 *
 * IP 不可判定(代理配置错/直连)时落「未知 IP」兜底桶:窗口与阈值都更宽松,
 * 既不放弃限速,也不因共享桶误伤正常用户。
 *
 * 计数走 failOpen:false——Redis 故障时抛 RateLimitUnavailableError,
 * 由路由回 503;绝不能「故障即放行」,那等于限流被静默绕过。
 */
export async function recordFailure(
  username: string,
  ip?: string | null,
): Promise<FailureGate> {
  const { security } = await getConfig();
  const userDim = await hitRateLimit(loginFailKey(username), {
    windowSec: security.loginWindowSec,
    max: security.loginMaxFails,
    failOpen: false,
  });
  const accountLocked = !userDim.allowed;

  const bucket = ip ?? UNKNOWN_CLIENT_IP;
  const unknown = !ip;
  const ipDim = await hitRateLimit(loginFailIpKey(bucket), {
    windowSec: unknown ? LOGIN_UNKNOWN_IP_WINDOW_SEC : security.loginWindowSec,
    max: unknown ? security.loginUnknownIpMaxPerMin : security.loginIpMaxFails,
    failOpen: false,
  });
  const ipLocked = !ipDim.allowed;

  if (ipLocked) {
    // 硬阈:只锁攻击源 IP
    await setLock(loginIpLockKey(bucket), security.loginIpLockSec);
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_IP_SUSPICIOUS,
      ip: ip ?? null,
      payload: { ip: bucket, fails: ipDim.count, locked: true },
    });
  } else if (!unknown && ipDim.count > security.loginIpSoftFails) {
    // 软阈:审计(窗口内去重)+ 续软锁串行化,请求不被拒绝
    await setLock(loginSoftLockKey(bucket), security.loginSoftLockSec);
    await writeAuditOnce(
      {
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.LOGIN_IP_SUSPICIOUS,
        ip: ip ?? null,
        payload: { ip: bucket, fails: ipDim.count, locked: false },
      },
      auditIpSuspiciousKey(bucket),
      security.loginWindowSec,
    );
  }

  if (accountLocked) {
    await setLock(loginLockKey(username), security.loginLockSec);
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_LOCKED,
      // ip 落顶层列(可按列检索),不进 payload
      ip: ip ?? null,
      payload: {
        username,
        ip: ip ?? null,
        fails: userDim.count,
      },
    });
  }

  return {
    accountLocked,
    ipLocked,
    retryAfterSec: accountLocked
      ? security.loginLockSec
      : ipLocked
        ? security.loginIpLockSec
        : 0,
  };
}

/**
 * 登录成功清账:清用户名维的失败计数与锁。
 *
 * **不清 IP 维计数**——IP 维是攻击源画像(识别「一个 IP 扫很多账号」),
 * 一次成功不得把它洗白:否则攻击者拿一个自有账号交替「失败刷号 + 成功清零」,
 * IP 锁就形同虚设。代价是共享出口(NAT)的后续失败会累计,
 * 靠宽松硬阈(默认 50)+ 后台可调兜底。
 */
export async function clearOnSuccess(username: string): Promise<void> {
  const keys = [loginFailKey(username), loginLockKey(username)];
  try {
    await clearKeys(keys);
  } catch {
    // 忽略:清账失败不影响本次登录结果
  }
}
