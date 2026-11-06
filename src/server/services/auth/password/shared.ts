import "server-only";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { srp6MakeRegistrationData } from "@/lib/auth/game-hash";
import { hashWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO } from "@/constants/password";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import { authDb } from "@/lib/db/auth";

/**
 * 密码变更共享件:策略校验、站点哈希前缀分派、per-user 锁与双写游戏端。
 * 双写顺序=游戏端先写、站点后写(契约:站点新哈希仅在双写成功后生效);
 * 游戏端失败→不标记完成、token 不消费(留待重试)+审计告警(FR-014 禁单边);
 * 游戏端成功但站点写入失败→回滚游戏 credential 到旧 verifier(并释放已消费
 * token),确保双端最终一致;成功→吊销全部会话与 refresh(FR-014)。并发用
 * per-user Redis 锁串行化(跨库无原子性,双请求交错会产生双端不一致)。
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

/** 游戏端写入失败;调用方决定重试语义 */
export class GameSyncError extends Error {}

export type GameCredential = { salt: string; verifier: string };

/** 游戏端写入:先读当前 credential 作为回滚快照,再写新 verifier */
export async function writeGamePassword(
  username: string,
  newPassword: string,
): Promise<{ accountId: number; previous: GameCredential }> {
  const account = await authDb.findByUsername(username);
  if (!account) throw new GameSyncError("game_account_missing");
  const previous: GameCredential = {
    salt: Buffer.from(account.salt).toString("hex"),
    verifier: Buffer.from(account.verifier).toString("hex"),
  };
  // 与 AC ChangePassword 同口径:重置随机 salt + verifier
  await authDb.updateAccountCredential(account.id, srp6MakeRegistrationData(username, newPassword));
  return { accountId: account.id, previous };
}

/** 用快照回滚游戏端 credential */
export async function restoreGameCredential(
  accountId: number,
  previous: GameCredential,
): Promise<void> {
  await authDb.updateAccountCredential(accountId, previous);
}

/** 站点侧写新密码哈希(改密/找回/激活三处统一走此口径) */
export async function writeSitePassword(userId: bigint, password: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashWpBcrypt(password), passwordAlgo: PASSWORD_ALGO.BCRYPT_WP },
  });
}

export async function auditDualWriteFailed(
  userId: bigint,
  reason: string,
  ip?: string | null,
): Promise<void> {
  try {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_FAILED,
      actorUserId: userId,
      payload: { reason },
      ip,
    });
  } catch {
    // 审计失败不应吞掉用户响应;已由上游返回可重试错误
  }
}

export async function auditDualWriteRecovered(
  userId: bigint,
  reason: string,
  ip?: string | null,
): Promise<void> {
  try {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_RECOVERED,
      actorUserId: userId,
      payload: { reason },
      ip,
    });
  } catch {
    // 审计失败不应吞掉用户响应
  }
}

export async function revokeEverything(userId: bigint): Promise<void> {
  await revokeAllSessions(userId.toString());
  await revokeAllRefreshTokens(userId.toString());
}
