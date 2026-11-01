import "server-only";
import { redis } from "@/lib/redis";
import { srp6MakeRegistrationData } from "@/lib/auth/game-hash";
import { verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { verifyPhpass } from "@/lib/auth/phpass";
import { PHPASS_PREFIX, WP_BCRYPT_PREFIX } from "@/constants/password";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import { authDb } from "@/lib/db/auth";

/**
 * 密码变更共享件:策略校验、站点哈希前缀分派、per-user 锁与双写游戏端。
 * 双写顺序=游戏端先写、站点后写(契约:站点新哈希仅在双写成功后生效);
 * 游戏端失败→不标记完成、token 不消费(留待重试)+审计告警(FR-014 禁单边);
 * 成功→吊销全部会话与 refresh(FR-014)。并发用 per-user Redis 锁串行化
 * (跨库无原子性,双请求交错会产生双端不一致)。
 */

export type PasswordChangeFailure =
  | "invalid_token"
  | "bad_current"
  | "weak_password"
  | "banned"
  | "game_sync_failed"
  | "concurrent_change";

export type PasswordChangeOutcome =
  | { ok: true }
  | { ok: false; reason: PasswordChangeFailure; message?: string };

export function validateNewPassword(
  password: string,
  username: string,
): { ok: true } | { ok: false; message: string } {
  if (password.length < 8) {
    return { ok: false, message: "密码至少 8 位。" };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, message: "密码需同时包含字母和数字。" };
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    return { ok: false, message: "密码不能与用户名相同。" };
  }
  return { ok: true };
}

/** 站点侧哈希前缀分派(与 login 同一权威,research R2) */
export function verifySitePassword(storedHash: string, password: string): boolean {
  if (storedHash.startsWith(WP_BCRYPT_PREFIX)) {
    return verifyWpBcrypt(password, storedHash);
  }
  if (storedHash.startsWith(PHPASS_PREFIX)) {
    return verifyPhpass(password, storedHash);
  }
  return false;
}

/** per-user 锁:跨库双写串行化,防并发交错产生双端不一致 */
export async function withPasswordLock<T>(
  userId: bigint,
  fn: () => Promise<T>,
  onLocked: () => T,
): Promise<T> {
  const key = `lock:pw:${userId}`;
  const acquired = await redis.set(key, "1", "EX", 10, "NX");
  if (!acquired) return onLocked();
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

export type SiteUser = {
  id: bigint;
  username: string;
  email: string;
  passwordHash: string;
  status: string;
};

/** 游戏端写入;失败抛出 GameSyncError(调用方决定重试语义) */
export class GameSyncError extends Error {}

export async function writeGamePassword(
  username: string,
  newPassword: string,
): Promise<void> {
  const account = await authDb.findByUsername(username);
  if (!account) throw new GameSyncError("game_account_missing");
  // 与 AC ChangePassword 同口径:重置随机 salt + verifier
  await authDb.updateAccountCredential(account.id, srp6MakeRegistrationData(username, newPassword));
}

export async function auditDualWriteFailed(
  userId: bigint,
  reason: string,
  ip?: string | null,
): Promise<void> {
  await writeAudit({
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_FAILED,
    actorUserId: userId,
    payload: { reason },
    ip,
  });
}

export async function revokeEverything(userId: bigint): Promise<void> {
  await revokeAllSessions(userId.toString());
  await revokeAllRefreshTokens(userId.toString());
}
